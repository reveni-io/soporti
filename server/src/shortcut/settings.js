import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Shortcut API token, stored in the database (app_config) and edited from the
// admin panel (Shortcut section) — no env var. The database is the single
// source of truth. The token is read on every Shortcut API call, so it is
// cached briefly; saves invalidate the cache immediately in this process, the
// TTL covers other instances.
//
// The token is a secret, so it is write-only from the admin's point of view
// (only whether it is configured is ever returned).

export const SHORTCUT_TOKEN_KEY = 'shortcut_api_token'

const CACHE_TTL_MS = 60_000
let cached = null // { value, expiresAt }

// Returns the token or null when not configured.
export async function getShortcutToken() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const stored = await getConfigValue(SHORTCUT_TOKEN_KEY)
  const value = typeof stored === 'string' && stored.length > 0 ? stored : null
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

// An empty string clears the token (the Shortcut integration is disabled).
export async function setShortcutToken(token) {
  await setConfigValue(SHORTCUT_TOKEN_KEY, token)
  cached = null
}

// True when a token is configured. Async because the token lives in the
// database now (it used to be a synchronous env-derived value).
export async function isShortcutConfigured() {
  return Boolean(await getShortcutToken())
}

// Test-only: clear the cache between tests.
export function _resetShortcutSettingsCacheForTests() {
  cached = null
}
