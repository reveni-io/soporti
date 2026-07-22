import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Sentry settings, stored in the database (app_config) and edited from the
// admin panel (Sentry section) — no env vars. The database is the single
// source of truth. They are read on every Sentry API call, so they are cached
// briefly; saves invalidate the cache immediately in this process, the TTL
// covers other instances.
//
// The auth token is a secret, so it is write-only from the admin's point of
// view (only whether it is configured is ever returned). The organization slug
// is not a secret and is returned as-is so the admin can see and edit it.

export const SENTRY_AUTH_TOKEN_KEY = 'sentry_auth_token'
export const SENTRY_ORG_KEY = 'sentry_org'

const CACHE_TTL_MS = 60_000
const cache = new Map() // key -> { value, expiresAt }

async function getCachedValue(key) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }
  const stored = await getConfigValue(key)
  const value = typeof stored === 'string' && stored.length > 0 ? stored : null
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

// Returns the auth token or null when not configured.
export async function getSentryToken() {
  return getCachedValue(SENTRY_AUTH_TOKEN_KEY)
}

// An empty string clears the auth token (the Sentry integration is disabled).
export async function setSentryToken(token) {
  await setConfigValue(SENTRY_AUTH_TOKEN_KEY, token)
  cache.delete(SENTRY_AUTH_TOKEN_KEY)
}

// Returns the organization slug or null when not configured.
export async function getSentryOrg() {
  return getCachedValue(SENTRY_ORG_KEY)
}

// An empty string clears the organization slug.
export async function setSentryOrg(org) {
  await setConfigValue(SENTRY_ORG_KEY, org)
  cache.delete(SENTRY_ORG_KEY)
}

// True when both the auth token and the organization slug are configured.
// Async because the values live in the database now (they used to be
// synchronous env-derived values).
export async function isSentryConfigured() {
  const [token, org] = await Promise.all([getSentryToken(), getSentryOrg()])
  return Boolean(token && org)
}

// Test-only: clear the cache between tests.
export function _resetSentrySettingsCacheForTests() {
  cache.clear()
}
