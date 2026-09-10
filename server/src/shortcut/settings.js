import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const SHORTCUT_TOKEN_KEY = 'shortcut_api_token'
export const SHORTCUT_WRITES_KEY = 'shortcut_writes_enabled'

const CACHE_TTL_MS = 60_000
const cache = new Map()

async function getCachedValue(key, parse) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }
  const value = parse(await getConfigValue(key))
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

function toToken(stored) {
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function getShortcutToken() {
  return getCachedValue(SHORTCUT_TOKEN_KEY, toToken)
}

export async function setShortcutToken(token) {
  await setConfigValue(SHORTCUT_TOKEN_KEY, token)
  cache.delete(SHORTCUT_TOKEN_KEY)
}

export async function getShortcutWritesEnabled() {
  return getCachedValue(SHORTCUT_WRITES_KEY, Boolean)
}

export async function setShortcutWritesEnabled(enabled) {
  await setConfigValue(SHORTCUT_WRITES_KEY, enabled)
  cache.delete(SHORTCUT_WRITES_KEY)
}

export async function isShortcutConfigured() {
  return Boolean(await getShortcutToken())
}

export async function areShortcutWritesEnabled() {
  const [token, enabled] = await Promise.all([getShortcutToken(), getShortcutWritesEnabled()])

  return Boolean(token && enabled)
}

export function _resetShortcutSettingsCacheForTests() {
  cache.clear()
}
