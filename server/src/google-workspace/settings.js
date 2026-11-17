import { OAuth2Client } from 'google-auth-library'
import { getGoogleClientId, getGoogleClientSecret } from '../auth/google-settings.js'
import {
  deleteGoogleConnection,
  getGoogleConnection as getStoredGoogleConnection,
  upsertGoogleConnection,
} from '../db/google-connections.js'
import { CALENDAR_READONLY_SCOPE, GMAIL_READONLY_SCOPE, GOOGLE_WORKSPACE_SCOPES } from '../constants.js'
import { decryptSecret, encryptSecret } from '../auth/secret-cipher.js'

const CACHE_TTL_MS = 60_000
const ACCESS_TOKEN_EXPIRY_MARGIN_MS = 60_000
const INVALID_GRANT = 'invalid_grant'
const SCOPE_SEPARATOR = ' '
const WORKSPACE_ACCESS_SCOPES = [GMAIL_READONLY_SCOPE, CALENDAR_READONLY_SCOPE]
const NOT_CONNECTED_MESSAGE = 'Google is not connected. Connect it from Settings → Connections.'
const REVOKED_MESSAGE = 'Google access was revoked. Reconnect it from Settings → Connections.'
const REFRESH_FAILED_MESSAGE = 'Google did not refresh the access token. Try again in a moment.'

const connectionCache = new Map()
const accessTokenCache = new Map()
const pendingRefreshes = new Map()

async function getClientCredentials() {
  const [clientId, clientSecret] = await Promise.all([getGoogleClientId(), getGoogleClientSecret()])
  if (!clientId || !clientSecret) return null

  return { clientId, clientSecret }
}

function parseStoredConnection(userId, row) {
  if (!row) return null

  try {
    return {
      email: row.email,
      refreshToken: decryptSecret(row.refreshToken),
      scopes: row.scopes.split(SCOPE_SEPARATOR).filter(Boolean),
    }
  } catch (err) {
    console.error(`Failed to decrypt the Google connection of user ${userId}:`, err.message)
    return null
  }
}

async function readConnection(userId) {
  return parseStoredConnection(userId, await getStoredGoogleConnection(userId))
}

async function getConnection(userId) {
  if (!userId) return null

  const entry = connectionCache.get(userId)
  if (entry && entry.expiresAt > Date.now()) return entry.value
  connectionCache.delete(userId)

  const value = await readConnection(userId)
  connectionCache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

function clearCaches(userId) {
  connectionCache.delete(userId)
  accessTokenCache.delete(userId)
}

async function hasGrantedScope(userId, scope) {
  if (!userId) return false

  const [credentials, connection] = await Promise.all([getClientCredentials(), getConnection(userId)])
  return Boolean(credentials && connection?.scopes.includes(scope))
}

export function grantsWorkspaceAccess(scopes) {
  return WORKSPACE_ACCESS_SCOPES.some(scope => scopes.includes(scope))
}

export async function isGmailConfigured(userId) {
  return hasGrantedScope(userId, GMAIL_READONLY_SCOPE)
}

export async function isGoogleCalendarConfigured(userId) {
  return hasGrantedScope(userId, CALENDAR_READONLY_SCOPE)
}

function getCachedAccessToken(userId) {
  const entry = accessTokenCache.get(userId)
  if (entry && entry.expiresAt - ACCESS_TOKEN_EXPIRY_MARGIN_MS > Date.now()) return entry.token

  accessTokenCache.delete(userId)
  return null
}

async function requestAccessToken(credentials, refreshToken) {
  const client = new OAuth2Client(credentials)
  client.setCredentials({ refresh_token: refreshToken })

  const { token } = await client.getAccessToken()
  return { token, expiresAt: client.credentials.expiry_date }
}

async function toRefreshError(userId, err) {
  if (err.response?.data?.error !== INVALID_GRANT) {
    console.error('Failed to refresh the Google access token:', err.message)
    return new Error(REFRESH_FAILED_MESSAGE)
  }

  await removeGoogleConnection(userId)
  return new Error(REVOKED_MESSAGE)
}

async function refreshAccessToken(userId) {
  const [credentials, connection] = await Promise.all([getClientCredentials(), getConnection(userId)])
  if (!credentials || !connection) throw new Error(NOT_CONNECTED_MESSAGE)

  try {
    const { token, expiresAt } = await requestAccessToken(credentials, connection.refreshToken)
    accessTokenCache.set(userId, { token, expiresAt })
    return token
  } catch (err) {
    throw await toRefreshError(userId, err)
  }
}

export async function getGoogleAccessToken(userId) {
  if (!userId) throw new Error(NOT_CONNECTED_MESSAGE)

  const cached = getCachedAccessToken(userId)
  if (cached) return cached

  if (!pendingRefreshes.has(userId)) {
    const pending = refreshAccessToken(userId).finally(() => pendingRefreshes.delete(userId))
    pendingRefreshes.set(userId, pending)
  }

  return pendingRefreshes.get(userId)
}

export function invalidateGoogleAccessToken(userId) {
  accessTokenCache.delete(userId)
}

export async function describeGoogleConnection(userId) {
  const [credentials, connection] = await Promise.all([getClientCredentials(), getConnection(userId)])
  const available = Boolean(credentials)
  const granted = connection?.scopes ?? []

  return {
    available,
    connected: Boolean(connection),
    email: connection?.email ?? null,
    gmail: granted.includes(GMAIL_READONLY_SCOPE),
    calendar: granted.includes(CALENDAR_READONLY_SCOPE),
    scopes: available ? GOOGLE_WORKSPACE_SCOPES : null,
  }
}

export async function saveGoogleConnection(userId, { email, refreshToken, scopes, accessToken, expiresAt }) {
  await upsertGoogleConnection(userId, {
    email,
    refreshToken: encryptSecret(refreshToken),
    scopes: scopes.join(SCOPE_SEPARATOR),
  })
  clearCaches(userId)

  if (accessToken && expiresAt) accessTokenCache.set(userId, { token: accessToken, expiresAt })
}

export async function removeGoogleConnection(userId) {
  await deleteGoogleConnection(userId)
  clearCaches(userId)
}

async function revokeQuietly(refreshToken) {
  try {
    await new OAuth2Client().revokeToken(refreshToken)
  } catch (err) {
    console.error('Failed to revoke the Google token:', err.response?.status ?? err.name)
  }
}

export async function disconnectGoogle(userId) {
  const connection = await readConnection(userId)
  if (connection) await revokeQuietly(connection.refreshToken)

  await removeGoogleConnection(userId)
}

export function _resetGoogleWorkspaceCacheForTests() {
  connectionCache.clear()
  accessTokenCache.clear()
  pendingRefreshes.clear()
}
