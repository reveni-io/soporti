import { OAuth2Client } from 'google-auth-library'
import { getAllowedDomains } from './allowed-domains.js'
import { getAuthMethods } from './auth-methods.js'
import { getGoogleClientId, getGoogleClientSecret } from './google-settings.js'

export const GOOGLE_SIGN_IN_REJECTED = 'DOMAIN_NOT_ALLOWED'
export const INVALID_GOOGLE_CODE = 'INVALID_GOOGLE_CODE'

const CODE_REDIRECT_URI = 'postmessage'
const INVALID_GRANT = 'invalid_grant'
const SCOPE_SEPARATOR = ' '

let client = null
let clientIdForCache = null

function getClient(clientId) {
  if (!client || clientIdForCache !== clientId) {
    client = new OAuth2Client(clientId)
    clientIdForCache = clientId
  }
  return client
}

function codedError(message, code) {
  const err = new Error(message)
  err.code = code
  return err
}

async function requireClientId() {
  const clientId = await getGoogleClientId()
  if (!clientId) {
    throw codedError(
      'Google sign-in is not configured. Ask an admin to set the Google Client ID.',
      GOOGLE_SIGN_IN_REJECTED
    )
  }

  return clientId
}

async function verifyIdToken(clientId, idToken) {
  const ticket = await getClient(clientId).verifyIdToken({
    idToken,
    audience: clientId,
  })

  const payload = ticket.getPayload()

  if (!payload?.email || !payload.email_verified) {
    throw new Error('Unverified Google account.')
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || null,
    picture: payload.picture || null,
  }
}

async function assertSignInAllowed(email) {
  const [methods, domains] = await Promise.all([getAuthMethods(), getAllowedDomains()])
  if (!methods.google) {
    throw codedError('Google sign-in is disabled. Ask an admin to enable it.', GOOGLE_SIGN_IN_REJECTED)
  }

  const emailDomain = email.toLowerCase().split('@')[1]
  if (domains.length > 0 && !domains.some(domain => domain.toLowerCase() === emailDomain)) {
    const allowed = domains.map(domain => `@${domain}`).join(', ')
    throw codedError(`Only ${allowed} accounts are allowed.`, GOOGLE_SIGN_IN_REJECTED)
  }
}

export async function verifyGoogleCredential(idToken) {
  const clientId = await requireClientId()
  const profile = await verifyIdToken(clientId, idToken)

  await assertSignInAllowed(profile.email)
  return profile
}

function toExchangeError(err) {
  if (err.response?.data?.error === INVALID_GRANT) {
    return codedError('The Google authorization code is invalid or expired.', INVALID_GOOGLE_CODE)
  }

  return new Error(`Google did not exchange the authorization code: ${err.message}`)
}

async function requestTokens(clientId, code) {
  const clientSecret = await getGoogleClientSecret()
  if (!clientSecret) {
    throw codedError(
      'Google access is not configured. Ask an admin to set the Google client secret.',
      GOOGLE_SIGN_IN_REJECTED
    )
  }

  try {
    const { tokens } = await new OAuth2Client({ clientId, clientSecret, redirectUri: CODE_REDIRECT_URI }).getToken(code)
    return tokens
  } catch (err) {
    throw toExchangeError(err)
  }
}

function toConnectionTokens(tokens) {
  return {
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token ?? null,
    expiresAt: tokens.expiry_date ?? null,
    scopes: (tokens.scope ?? '').split(SCOPE_SEPARATOR).filter(Boolean),
  }
}

export async function exchangeGoogleCode(code, { enforceSignInPolicy = true } = {}) {
  const clientId = await requireClientId()
  const tokens = await requestTokens(clientId, code)
  const profile = await verifyIdToken(clientId, tokens.id_token)

  if (enforceSignInPolicy) await assertSignInAllowed(profile.email)

  return { profile, tokens: toConnectionTokens(tokens) }
}
