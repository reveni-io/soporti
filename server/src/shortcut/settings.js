import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const SHORTCUT_TOKEN_KEY = 'shortcut_api_token'

const CACHE_TTL_MS = 60_000
let cached = null

export async function getShortcutToken() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const stored = await getConfigValue(SHORTCUT_TOKEN_KEY)
  const value = typeof stored === 'string' && stored.length > 0 ? stored : null
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function setShortcutToken(token) {
  await setConfigValue(SHORTCUT_TOKEN_KEY, token)
  cached = null
}

export async function isShortcutConfigured() {
  return Boolean(await getShortcutToken())
}

export function _resetShortcutSettingsCacheForTests() {
  cached = null
}
