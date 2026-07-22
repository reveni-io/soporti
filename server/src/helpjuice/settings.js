import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Helpjuice settings, stored in the database (app_config) and edited from the
// admin panel (Helpjuice section) — no env vars. The database is the single
// source of truth. They are read on every Helpjuice API call, so they are
// cached briefly; saves invalidate the cache immediately in this process, the
// TTL covers other instances.
//
// The API key is a secret, so it is write-only from the admin's point of view
// (only whether it is configured is ever returned). The account subdomain is
// not a secret and is returned as-is so the admin can see and edit it.

export const HELPJUICE_API_KEY_KEY = 'helpjuice_api_key'
export const HELPJUICE_ACCOUNT_KEY = 'helpjuice_account'

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

// Returns the API key or null when not configured.
export async function getHelpjuiceApiKey() {
  return getCachedValue(HELPJUICE_API_KEY_KEY)
}

// An empty string clears the API key (the Helpjuice integration is disabled).
export async function setHelpjuiceApiKey(apiKey) {
  await setConfigValue(HELPJUICE_API_KEY_KEY, apiKey)
  cache.delete(HELPJUICE_API_KEY_KEY)
}

// Returns the account subdomain (e.g. "acme" for acme.helpjuice.com) or
// null when not configured.
export async function getHelpjuiceAccount() {
  return getCachedValue(HELPJUICE_ACCOUNT_KEY)
}

// An empty string clears the account subdomain.
export async function setHelpjuiceAccount(account) {
  await setConfigValue(HELPJUICE_ACCOUNT_KEY, account)
  cache.delete(HELPJUICE_ACCOUNT_KEY)
}

// True when both the API key and the account are configured. Async because
// the values live in the database now (they used to be synchronous
// env-derived values).
export async function isHelpjuiceConfigured() {
  const [apiKey, account] = await Promise.all([getHelpjuiceApiKey(), getHelpjuiceAccount()])
  return Boolean(apiKey && account)
}

// Test-only: clear the cache between tests.
export function _resetHelpjuiceSettingsCacheForTests() {
  cache.clear()
}
