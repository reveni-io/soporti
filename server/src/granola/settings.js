import { deleteGranolaCredential, getGranolaCredential, setGranolaCredential } from '../db/granola-credentials.js'

const API_KEY_RE = /^grn_[A-Za-z0-9_-]{16,200}$/
const CACHE_TTL_MS = 60_000

const cache = new Map()

export function parseGranolaApiKey(input) {
  const trimmed = typeof input === 'string' ? input.trim() : ''

  if (!API_KEY_RE.test(trimmed)) {
    const err = new Error('That does not look like a Granola API key. Keys start with "grn_".')
    err.code = 'INVALID_GRANOLA_API_KEY'
    throw err
  }

  return trimmed
}

export async function getGranolaApiKey(userId) {
  if (!userId) return null

  const entry = cache.get(userId)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }
  cache.delete(userId)

  const stored = await getGranolaCredential(userId)
  const value = typeof stored === 'string' && stored.length > 0 ? stored : null
  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export async function setGranolaApiKey(userId, input) {
  if (typeof input === 'string' && input.trim() === '') {
    await deleteGranolaCredential(userId)
    cache.delete(userId)
    return null
  }

  const apiKey = parseGranolaApiKey(input)
  await setGranolaCredential(userId, apiKey)
  cache.delete(userId)
  return apiKey
}

export async function isGranolaConfigured(userId) {
  return Boolean(await getGranolaApiKey(userId))
}

export function _resetGranolaSettingsCacheForTests() {
  cache.clear()
}
