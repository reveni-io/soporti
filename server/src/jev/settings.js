import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const JEV_API_KEY_KEY = 'jev_api_key'
export const JEV_MODEL_CATALOG_KEY = 'jev_model_catalog'
export const JEV_CALLS_ENABLED_KEY = 'jev_calls_enabled'
export const GUARD_SENDING_ENABLED_KEY = 'guard_sending_enabled'

const CACHE_TTL_MS = 60_000
const EMPTY_CATALOG = { models: [], scannedAt: null }
const cache = new Map()

async function getCachedValue(key) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) return entry.value

  const value = await getConfigValue(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })

  return value
}

async function saveValue(key, value) {
  await setConfigValue(key, value)
  cache.delete(key)
}

export async function getJevApiKey() {
  const stored = await getCachedValue(JEV_API_KEY_KEY)

  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function isConfigured() {
  return (await getJevApiKey()) !== null
}

export async function setJevApiKey(apiKey) {
  await saveValue(JEV_API_KEY_KEY, apiKey)
}

export async function getJevModelCatalog() {
  const stored = await getCachedValue(JEV_MODEL_CATALOG_KEY)

  return Array.isArray(stored?.models) ? stored : EMPTY_CATALOG
}

export async function setJevModelCatalog(catalog) {
  await saveValue(JEV_MODEL_CATALOG_KEY, catalog)
}

export async function areJevCallsEnabled() {
  return (await getCachedValue(JEV_CALLS_ENABLED_KEY)) === true
}

export async function setJevCallsEnabled(enabled) {
  await saveValue(JEV_CALLS_ENABLED_KEY, enabled)
}

export async function isGuardSendingEnabled() {
  return (await getCachedValue(GUARD_SENDING_ENABLED_KEY)) === true
}

export async function setGuardSendingEnabled(enabled) {
  await saveValue(GUARD_SENDING_ENABLED_KEY, enabled)
}

export function _resetJevSettingsCacheForTests() {
  cache.clear()
}
