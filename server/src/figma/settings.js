import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const FIGMA_TOKEN_KEY = 'figma_token'
export const FIGMA_COMMENTS_KEY = 'figma_comments_enabled'

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

export async function getFigmaToken() {
  return getCachedValue(FIGMA_TOKEN_KEY, toToken)
}

export async function setFigmaToken(token) {
  await setConfigValue(FIGMA_TOKEN_KEY, token)
  cache.delete(FIGMA_TOKEN_KEY)
}

export async function getFigmaCommentsEnabled() {
  return getCachedValue(FIGMA_COMMENTS_KEY, Boolean)
}

export async function setFigmaCommentsEnabled(enabled) {
  await setConfigValue(FIGMA_COMMENTS_KEY, enabled)
  cache.delete(FIGMA_COMMENTS_KEY)
}

export async function isFigmaConfigured() {
  return Boolean(await getFigmaToken())
}

export function _resetFigmaSettingsCacheForTests() {
  cache.clear()
}
