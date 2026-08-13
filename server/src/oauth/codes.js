import { createHash } from 'node:crypto'
import { OAUTH_CODE_TTL_MS } from '../constants.js'
import { consumeAuthorizationCode, createAuthorizationCode } from '../db/oauth-codes.js'
import { equalsConstantTime, generateSecret, hashSecret } from './secrets.js'

const CODE_CHALLENGE_RE = /^[A-Za-z0-9\-._~]{43,128}$/

export function isValidCodeChallenge(value) {
  return typeof value === 'string' && CODE_CHALLENGE_RE.test(value)
}

export function verifyCodeChallenge(codeVerifier, codeChallenge) {
  if (!isValidCodeChallenge(codeVerifier)) return false

  return equalsConstantTime(createHash('sha256').update(codeVerifier).digest('base64url'), codeChallenge)
}

export async function issueAuthorizationCode({ clientId, userId, redirectUri, codeChallenge, scope, resource }) {
  const code = generateSecret()

  await createAuthorizationCode({
    codeHash: hashSecret(code),
    clientId,
    userId,
    redirectUri,
    codeChallenge,
    scope,
    resource: resource ?? null,
    expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
  })

  return code
}

export async function redeemAuthorizationCode({ code, clientId, redirectUri, codeVerifier }) {
  if (typeof code !== 'string' || !code) return { error: 'The authorization code is missing.' }

  const grant = await consumeAuthorizationCode(hashSecret(code))
  if (!grant) return { error: 'The authorization code is invalid, expired or already used.' }

  if (grant.clientId !== clientId) return { error: 'The authorization code was issued to another client.' }
  if (grant.redirectUri !== redirectUri) return { error: 'The redirect_uri does not match the authorization request.' }
  if (!verifyCodeChallenge(codeVerifier, grant.codeChallenge)) {
    return { error: 'The code_verifier does not match the code_challenge.' }
  }

  return { value: { userId: grant.userId, scope: grant.scope } }
}
