import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const SHOPIFY_TOKEN_QUERY_KEY = 'shopify_token_query'

export const STORE_PLACEHOLDER = '{{store}}'

const CACHE_TTL_MS = 60_000
let cache = null

export async function getShopifyTokenQuery() {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value
  }
  const stored = await getConfigValue(SHOPIFY_TOKEN_QUERY_KEY)
  const value = typeof stored === 'string' && stored.length > 0 ? stored : null
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function setShopifyTokenQuery(query) {
  await setConfigValue(SHOPIFY_TOKEN_QUERY_KEY, query)
  cache = null
}

export function _resetShopifySettingsCacheForTests() {
  cache = null
}
