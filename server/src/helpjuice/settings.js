import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const HELPJUICE_API_KEY_KEY = 'helpjuice_api_key'
export const HELPJUICE_ACCOUNT_KEY = 'helpjuice_account'

const CACHE_TTL_MS = 60_000
const cache = new Map()

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

export async function getHelpjuiceApiKey() {
  return getCachedValue(HELPJUICE_API_KEY_KEY)
}

export async function setHelpjuiceApiKey(apiKey) {
  await setConfigValue(HELPJUICE_API_KEY_KEY, apiKey)
  cache.delete(HELPJUICE_API_KEY_KEY)
}

export async function getHelpjuiceAccount() {
  return getCachedValue(HELPJUICE_ACCOUNT_KEY)
}

export async function setHelpjuiceAccount(account) {
  await setConfigValue(HELPJUICE_ACCOUNT_KEY, account)
  cache.delete(HELPJUICE_ACCOUNT_KEY)
}

export async function isHelpjuiceConfigured() {
  const [apiKey, account] = await Promise.all([getHelpjuiceApiKey(), getHelpjuiceAccount()])
  return Boolean(apiKey && account)
}

export function _resetHelpjuiceSettingsCacheForTests() {
  cache.clear()
}
