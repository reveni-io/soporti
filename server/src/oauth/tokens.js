import jwt from 'jsonwebtoken'
import config from '../config.js'
import { OAUTH_ACCESS_TOKEN_TTL_SECONDS, OAUTH_REFRESH_TOKEN_TTL_MS } from '../constants.js'
import {
  createRefreshToken,
  findRefreshTokenByHash,
  hasActiveSuccessor,
  replaceRefreshToken,
  revokeRefreshTokensForGrant,
} from '../db/oauth-refresh-tokens.js'
import { mcpResourceUri } from './metadata.js'
import { generateSecret, hashSecret } from './secrets.js'

const REUSE_ERROR = 'The refresh token was already used.'
const REUSE_GRACE_MS = 60_000

export function issueAccessToken({ userId, clientId, scope }) {
  return jwt.sign({ scope, client_id: clientId }, config.jwt.secret, {
    algorithm: 'HS256',
    subject: String(userId),
    audience: mcpResourceUri(),
    issuer: config.publicUrl,
    expiresIn: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  })
}

export function verifyAccessToken(token) {
  let payload
  try {
    payload = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
      audience: mcpResourceUri(),
      issuer: config.publicUrl,
    })
  } catch {
    return null
  }

  const userId = Number(payload.sub)
  if (!Number.isInteger(userId) || userId <= 0) return null

  return { userId, clientId: payload.client_id, scope: payload.scope }
}

function buildRefreshTokenRecord(token, { clientId, userId, scope }) {
  return {
    tokenHash: hashSecret(token),
    clientId,
    userId,
    scope,
    expiresAt: new Date(Date.now() + OAUTH_REFRESH_TOKEN_TTL_MS),
  }
}

export async function issueRefreshToken({ clientId, userId, scope, rotatedFromId }) {
  const token = generateSecret()

  await createRefreshToken({ ...buildRefreshTokenRecord(token, { clientId, userId, scope }), rotatedFromId })

  return token
}

function isWithinReuseGrace(revokedAt) {
  return Date.now() - revokedAt.getTime() <= REUSE_GRACE_MS
}

async function revokeGrant({ userId, clientId }) {
  await revokeRefreshTokensForGrant(userId, clientId)
  console.error(`Revoked the OAuth grant of user ${userId} for client ${clientId}: a refresh token was replayed.`)

  return { error: REUSE_ERROR }
}

async function acceptConcurrentRefresh(stored) {
  if (!(await hasActiveSuccessor(stored.id))) return revokeGrant(stored)

  const refreshToken = await issueRefreshToken({
    clientId: stored.clientId,
    userId: stored.userId,
    scope: stored.scope,
    rotatedFromId: stored.id,
  })

  return { value: { userId: stored.userId, scope: stored.scope, refreshToken } }
}

function resolveReplay(stored) {
  if (!isWithinReuseGrace(stored.revokedAt)) return revokeGrant(stored)

  return acceptConcurrentRefresh(stored)
}

export async function rotateRefreshToken({ token, clientId }) {
  if (typeof token !== 'string' || !token) return { error: 'The refresh token is missing.' }

  const stored = await findRefreshTokenByHash(hashSecret(token))
  if (!stored || stored.clientId !== clientId) return { error: 'The refresh token is not valid.' }
  if (stored.revokedAt) return resolveReplay(stored)
  if (stored.expiresAt.getTime() <= Date.now()) return { error: 'The refresh token has expired.' }

  const refreshToken = generateSecret()
  const isReplaced = await replaceRefreshToken(stored.id, buildRefreshTokenRecord(refreshToken, stored))
  if (!isReplaced) return acceptConcurrentRefresh(stored)

  return { value: { userId: stored.userId, scope: stored.scope, refreshToken } }
}
