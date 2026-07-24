import { OAuth2Client } from 'google-auth-library'
import { getAllowedDomains } from './allowed-domains.js'
import { getAuthMethods } from './auth-methods.js'
import { getGoogleClientId } from './google-settings.js'

let client = null
let clientIdForCache = null

function getClient(clientId) {
  if (!client || clientIdForCache !== clientId) {
    client = new OAuth2Client(clientId)
    clientIdForCache = clientId
  }
  return client
}

export async function verifyGoogleCredential(idToken) {
  const clientId = await getGoogleClientId()
  if (!clientId) {
    const err = new Error('Google sign-in is not configured. Ask an admin to set the Google Client ID.')
    err.code = 'DOMAIN_NOT_ALLOWED'
    throw err
  }

  const ticket = await getClient(clientId).verifyIdToken({
    idToken,
    audience: clientId,
  })

  const payload = ticket.getPayload()

  if (!payload?.email || !payload.email_verified) {
    throw new Error('Unverified Google account.')
  }

  const [methods, domains] = await Promise.all([getAuthMethods(), getAllowedDomains()])
  if (!methods.google) {
    const err = new Error('Google sign-in is disabled. Ask an admin to enable it.')
    err.code = 'DOMAIN_NOT_ALLOWED'
    throw err
  }

  const emailDomain = payload.email.toLowerCase().split('@')[1]
  if (domains.length > 0 && !domains.some(domain => domain.toLowerCase() === emailDomain)) {
    const err = new Error(`Only ${domains.map(domain => `@${domain}`).join(', ')} accounts are allowed.`)
    err.code = 'DOMAIN_NOT_ALLOWED'
    throw err
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || null,
    picture: payload.picture || null,
  }
}
