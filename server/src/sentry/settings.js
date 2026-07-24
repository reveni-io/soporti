import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const SENTRY_AUTH_TOKEN_KEY = 'sentry_auth_token'
export const SENTRY_ORG_KEY = 'sentry_org'

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

export async function getSentryToken() {
  return getCachedValue(SENTRY_AUTH_TOKEN_KEY)
}

export async function setSentryToken(token) {
  await setConfigValue(SENTRY_AUTH_TOKEN_KEY, token)
  cache.delete(SENTRY_AUTH_TOKEN_KEY)
}

export async function getSentryOrg() {
  return getCachedValue(SENTRY_ORG_KEY)
}

export async function setSentryOrg(org) {
  await setConfigValue(SENTRY_ORG_KEY, org)
  cache.delete(SENTRY_ORG_KEY)
}

export async function isSentryConfigured() {
  const [token, org] = await Promise.all([getSentryToken(), getSentryOrg()])
  return Boolean(token && org)
}

export function _resetSentrySettingsCacheForTests() {
  cache.clear()
}
