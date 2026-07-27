import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const BETTERSTACK_API_TOKEN_KEY = 'betterstack_api_token'
export const BETTERSTACK_CONNECT_HOST_KEY = 'betterstack_connect_host'
export const BETTERSTACK_USERNAME_KEY = 'betterstack_connection_username'
export const BETTERSTACK_PASSWORD_KEY = 'betterstack_connection_password'

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

export async function getBetterstackApiToken() {
  return getCachedValue(BETTERSTACK_API_TOKEN_KEY)
}

export async function setBetterstackApiToken(token) {
  await setConfigValue(BETTERSTACK_API_TOKEN_KEY, token)
  cache.delete(BETTERSTACK_API_TOKEN_KEY)
}

export async function getBetterstackConnectHost() {
  return getCachedValue(BETTERSTACK_CONNECT_HOST_KEY)
}

export async function setBetterstackConnectHost(host) {
  await setConfigValue(BETTERSTACK_CONNECT_HOST_KEY, host)
  cache.delete(BETTERSTACK_CONNECT_HOST_KEY)
}

export async function getBetterstackUsername() {
  return getCachedValue(BETTERSTACK_USERNAME_KEY)
}

export async function setBetterstackUsername(username) {
  await setConfigValue(BETTERSTACK_USERNAME_KEY, username)
  cache.delete(BETTERSTACK_USERNAME_KEY)
}

export async function getBetterstackPassword() {
  return getCachedValue(BETTERSTACK_PASSWORD_KEY)
}

export async function setBetterstackPassword(password) {
  await setConfigValue(BETTERSTACK_PASSWORD_KEY, password)
  cache.delete(BETTERSTACK_PASSWORD_KEY)
}

export async function isBetterstackConfigured() {
  const [token, host, username, password] = await Promise.all([
    getBetterstackApiToken(),
    getBetterstackConnectHost(),
    getBetterstackUsername(),
    getBetterstackPassword(),
  ])
  return Boolean(token && host && username && password)
}

export function _resetBetterstackSettingsCacheForTests() {
  cache.clear()
}
