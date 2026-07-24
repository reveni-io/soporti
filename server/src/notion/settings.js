import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const NOTION_TOKEN_KEY = 'notion_token'

const CACHE_TTL_MS = 60_000
let cached = null

export async function getNotionToken() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const stored = await getConfigValue(NOTION_TOKEN_KEY)
  const value = typeof stored === 'string' && stored.length > 0 ? stored : null
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function setNotionToken(token) {
  await setConfigValue(NOTION_TOKEN_KEY, token)
  cached = null
}

export async function isNotionConfigured() {
  return Boolean(await getNotionToken())
}

export function _resetNotionSettingsCacheForTests() {
  cached = null
}
