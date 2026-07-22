import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Google Sign-In client id, stored in the database (app_config) and edited from
// the admin panel (Authentication section) — no env var. The database is the
// single source of truth. Read on every Google login (to build the OAuth2
// client and verify the token audience), so it is cached briefly; saves
// invalidate the cache immediately in this process, the TTL covers other
// instances.
//
// Not a secret: the same value is shipped to the browser as VITE_GOOGLE_CLIENT_ID
// (baked into the frontend build), which must be kept equal to this one.

export const GOOGLE_CLIENT_ID_KEY = 'google_client_id'

const CACHE_TTL_MS = 60_000
let cached = null // { value, expiresAt }

// Returns the configured client id, or null when unset/empty.
export async function getGoogleClientId() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const stored = await getConfigValue(GOOGLE_CLIENT_ID_KEY)
  const value = typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

// An empty string clears the client id (Google sign-in disabled until one is set).
export async function setGoogleClientId(clientId) {
  await setConfigValue(GOOGLE_CLIENT_ID_KEY, clientId)
  cached = null
}

// Test-only: clear the cache between tests.
export function _resetGoogleSettingsCacheForTests() {
  cached = null
}
