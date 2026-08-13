import { randomBytes } from 'node:crypto'
import { MAX_OAUTH_CLIENT_NAME_LENGTH, MAX_OAUTH_REDIRECT_URI_LENGTH, MAX_OAUTH_REDIRECT_URIS } from '../constants.js'
import { createOAuthClient, findOAuthClient } from '../db/oauth-clients.js'

const CLIENT_ID_BYTES = 16
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const DEFAULT_CLIENT_NAME = 'MCP client'

export function isValidRedirectUri(value) {
  if (typeof value !== 'string' || value.length > MAX_OAUTH_REDIRECT_URI_LENGTH) return false

  let url
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.hash) return false
  if (url.protocol === 'https:') return true

  return url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname)
}

export function parseClientRegistration(body) {
  const { client_name: clientName, redirect_uris: redirectUris } = body ?? {}

  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return { error: 'redirect_uris must be a non-empty array.' }
  }
  if (redirectUris.length > MAX_OAUTH_REDIRECT_URIS) {
    return { error: `redirect_uris must hold at most ${MAX_OAUTH_REDIRECT_URIS} entries.` }
  }
  if (!redirectUris.every(isValidRedirectUri)) {
    return { error: 'Every redirect_uri must be an https URL, or an http loopback URL, without a fragment.' }
  }

  const name = typeof clientName === 'string' ? clientName.trim() : ''
  if (name.length > MAX_OAUTH_CLIENT_NAME_LENGTH) {
    return { error: `client_name is too long (max ${MAX_OAUTH_CLIENT_NAME_LENGTH} characters).` }
  }

  return { value: { name: name || DEFAULT_CLIENT_NAME, redirectUris } }
}

export async function registerClient({ name, redirectUris }) {
  return createOAuthClient({ clientId: randomBytes(CLIENT_ID_BYTES).toString('hex'), name, redirectUris })
}

export async function getClient(clientId) {
  if (typeof clientId !== 'string' || !clientId) return null

  return findOAuthClient(clientId)
}

export function isRegisteredRedirectUri(client, redirectUri) {
  return Array.isArray(client.redirectUris) && client.redirectUris.includes(redirectUri)
}
