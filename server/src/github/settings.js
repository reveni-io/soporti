import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const GITHUB_TOKEN_KEY = 'github_token'
export const GITHUB_WEBHOOK_SECRET_KEY = 'github_webhook_secret'
export const REPO_CATALOG_KEY = 'repo_catalog'

const CACHE_TTL_MS = 60_000
const cache = new Map()

async function getCachedValue(key) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }
  const value = await getConfigValue(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export async function getGithubToken() {
  const stored = await getCachedValue(GITHUB_TOKEN_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function setGithubToken(token) {
  await setConfigValue(GITHUB_TOKEN_KEY, token)
  cache.delete(GITHUB_TOKEN_KEY)
}

export async function getWebhookSecret() {
  const stored = await getCachedValue(GITHUB_WEBHOOK_SECRET_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function setWebhookSecret(secret) {
  await setConfigValue(GITHUB_WEBHOOK_SECRET_KEY, secret)
  cache.delete(GITHUB_WEBHOOK_SECRET_KEY)
}

export async function getRepoCatalog() {
  const stored = await getCachedValue(REPO_CATALOG_KEY)
  return typeof stored === 'string' ? stored : ''
}

export async function setRepoCatalog(catalog) {
  await setConfigValue(REPO_CATALOG_KEY, catalog)
  cache.delete(REPO_CATALOG_KEY)
}

export function _resetSettingsCacheForTests() {
  cache.clear()
}
