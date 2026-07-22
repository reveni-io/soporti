import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Settings for the Shopify integration, stored in the database (app_config)
// and edited from the admin panel (Shopify section) — no env vars. Shopify
// store credentials live in the customer's read-only PostgreSQL database, and
// each deployment has its own schema, so the lookup query is configuration:
// a SQL SELECT template that receives the store identifier the assistant was
// given via the {{store}} placeholder and must return one row with `domain`
// and `token` columns.

export const SHOPIFY_TOKEN_QUERY_KEY = 'shopify_token_query'

// Placeholder the template must contain. Every occurrence is replaced with the
// store identifier as a safely quoted SQL string literal.
export const STORE_PLACEHOLDER = '{{store}}'

const CACHE_TTL_MS = 60_000
let cache = null // { value, expiresAt }

// Returns the token query template or null when not configured.
export async function getShopifyTokenQuery() {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value
  }
  const stored = await getConfigValue(SHOPIFY_TOKEN_QUERY_KEY)
  const value = typeof stored === 'string' && stored.length > 0 ? stored : null
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

// An empty string clears the query (the Shopify tools are disabled).
export async function setShopifyTokenQuery(query) {
  await setConfigValue(SHOPIFY_TOKEN_QUERY_KEY, query)
  cache = null
}

// Test-only: clear the cache between tests.
export function _resetShopifySettingsCacheForTests() {
  cache = null
}
