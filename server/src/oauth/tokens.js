import jwt from 'jsonwebtoken'
import config from '../config.js'
import { OAUTH_ACCESS_TOKEN_TTL_SECONDS, OAUTH_REFRESH_TOKEN_TTL_MS } from '../constants.js'
import {
  createRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeRefreshTokensForGrant,
} from '../db/oauth-refresh-tokens.js'
import { mcpResourceUri } from './metadata.js'
import { generateSecret, hashSecret } from './secrets.js'

const REUSE_ERROR = 'The refresh token was already used.'

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

export async function issueRefreshToken({ clientId, userId, scope, rotatedFromId }) {
  const token = generateSecret()

  await createRefreshToken({
    tokenHash: hashSecret(token),
    clientId,
    userId,
    scope,
    rotatedFromId,
    expiresAt: new Date(Date.now() + OAUTH_REFRESH_TOKEN_TTL_MS),
  })

  return token
}

export async function rotateRefreshToken({ token, clientId }) {
  if (typeof token !== 'string' || !token) return { error: 'The refresh token is missing.' }

  const stored = await findRefreshTokenByHash(hashSecret(token))
  if (!stored || stored.clientId !== clientId) return { error: 'The refresh token is not valid.' }

  if (stored.revokedAt) {
    await revokeRefreshTokensForGrant(stored.userId, stored.clientId)
    return { error: REUSE_ERROR }
  }
  if (stored.expiresAt.getTime() <= Date.now()) return { error: 'The refresh token has expired.' }

  if (!(await revokeRefreshToken(stored.id))) {
    await revokeRefreshTokensForGrant(stored.userId, stored.clientId)
    return { error: REUSE_ERROR }
  }

  const refreshToken = await issueRefreshToken({
    clientId,
    userId: stored.userId,
    scope: stored.scope,
    rotatedFromId: stored.id,
  })

  return { value: { userId: stored.userId, scope: stored.scope, refreshToken } }
}
