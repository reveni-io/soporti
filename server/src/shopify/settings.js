import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const SHOPIFY_TOKEN_URL_KEY = 'shopify_token_url'
export const SHOPIFY_TOKEN_AUTHORIZATION_KEY = 'shopify_token_authorization'

export const STORE_PLACEHOLDER = '{{store}}'

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

export async function getShopifyTokenUrl() {
  return getCachedValue(SHOPIFY_TOKEN_URL_KEY)
}

export async function setShopifyTokenUrl(url) {
  await setConfigValue(SHOPIFY_TOKEN_URL_KEY, url)
  cache.delete(SHOPIFY_TOKEN_URL_KEY)
}

export async function getShopifyTokenAuthorization() {
  return getCachedValue(SHOPIFY_TOKEN_AUTHORIZATION_KEY)
}

export async function setShopifyTokenAuthorization(value) {
  await setConfigValue(SHOPIFY_TOKEN_AUTHORIZATION_KEY, value)
  cache.delete(SHOPIFY_TOKEN_AUTHORIZATION_KEY)
}

export async function isShopifyConfigured() {
  return Boolean(await getShopifyTokenUrl())
}

export function _resetShopifySettingsCacheForTests() {
  cache.clear()
}
