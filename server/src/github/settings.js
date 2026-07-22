import { getConfigValue, setConfigValue } from '../db/app-config.js'

// GitHub runtime settings, stored in the database (app_config) and edited
// from the admin panel (GitHub section) — no env vars. Values are cached
// briefly because the token is read on every GitHub call and the catalog on
// every chat turn; saves invalidate the cache immediately in this process,
// the TTL covers other instances.

export const GITHUB_TOKEN_KEY = 'github_token'
export const GITHUB_WEBHOOK_SECRET_KEY = 'github_webhook_secret'
export const REPO_CATALOG_KEY = 'repo_catalog'

const CACHE_TTL_MS = 60_000
const cache = new Map() // key -> { value, expiresAt }

async function getCachedValue(key) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }
  const value = await getConfigValue(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

// Returns the token or null when not configured.
export async function getGithubToken() {
  const stored = await getCachedValue(GITHUB_TOKEN_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

// An empty string clears the token (GitHub features disabled).
export async function setGithubToken(token) {
  await setConfigValue(GITHUB_TOKEN_KEY, token)
  cache.delete(GITHUB_TOKEN_KEY)
}

// Shared secret for the PR-review webhook (must match the GitHub org webhook
// configuration). Null when not configured — PR reviews disabled.
export async function getWebhookSecret() {
  const stored = await getCachedValue(GITHUB_WEBHOOK_SECRET_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

// An empty string clears the secret (PR reviews disabled).
export async function setWebhookSecret(secret) {
  await setConfigValue(GITHUB_WEBHOOK_SECRET_KEY, secret)
  cache.delete(GITHUB_WEBHOOK_SECRET_KEY)
}

// Free text describing what each repo covers; injected into the agent prompt.
export async function getRepoCatalog() {
  const stored = await getCachedValue(REPO_CATALOG_KEY)
  return typeof stored === 'string' ? stored : ''
}

export async function setRepoCatalog(catalog) {
  await setConfigValue(REPO_CATALOG_KEY, catalog)
  cache.delete(REPO_CATALOG_KEY)
}

// Test-only: clear the cache between tests.
export function _resetSettingsCacheForTests() {
  cache.clear()
}
