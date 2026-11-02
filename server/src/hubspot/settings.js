import { getConfigValue, setConfigValue } from '../db/app-config.js'
import { findUserById } from '../db/users.js'
import { hasAreaAccess, normalizeHubspotPermissions } from './permissions.js'

const HUBSPOT_TOKEN_KEY = 'hubspot_token'
const HUBSPOT_PERMISSIONS_KEY = 'hubspot_permissions'
const TOKEN_MAX_LENGTH = 500
const WHITESPACE_RE = /\s/
const CACHE_TTL_MS = 60_000

let snapshot = null

function toToken(stored) {
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

async function readSettings() {
  if (snapshot && snapshot.expiresAt > Date.now()) return snapshot.settings

  const [token, permissions] = await Promise.all([
    getConfigValue(HUBSPOT_TOKEN_KEY),
    getConfigValue(HUBSPOT_PERMISSIONS_KEY),
  ])
  const settings = { token: toToken(token), permissions: normalizeHubspotPermissions(permissions) }
  snapshot = { settings, expiresAt: Date.now() + CACHE_TTL_MS }

  return settings
}

async function hasEmail(userId) {
  const user = await findUserById(userId)

  return Boolean(user?.email)
}

export function parseHubspotToken(value) {
  if (typeof value !== 'string') return { error: 'The HubSpot key must be a string (empty to clear it).' }

  const token = value.trim()
  if (token.length > TOKEN_MAX_LENGTH || WHITESPACE_RE.test(token)) {
    return { error: `The HubSpot key must be a single value without spaces, up to ${TOKEN_MAX_LENGTH} characters.` }
  }

  return { value: token }
}

export async function getHubspotToken() {
  return (await readSettings()).token
}

export async function setHubspotToken(token) {
  await setConfigValue(HUBSPOT_TOKEN_KEY, token)
  snapshot = null
}

export async function getHubspotPermissions() {
  return (await readSettings()).permissions
}

export async function setHubspotPermissions(permissions) {
  await setConfigValue(HUBSPOT_PERMISSIONS_KEY, normalizeHubspotPermissions(permissions))
  snapshot = null
}

export async function isHubspotConfigured() {
  return Boolean(await getHubspotToken())
}

export async function resolveHubspotAccess({ userId, unattended, delegated = false }) {
  const { token, permissions } = await readSettings()
  if (!token) return null

  const attended = Boolean(userId) && !unattended && !delegated
  const canReply = attended && hasAreaAccess(permissions, 'conversations', 'reply') && (await hasEmail(userId))

  return { permissions, attended, delegated, canReply }
}

export function _resetHubspotSettingsCacheForTests() {
  snapshot = null
}
