import { getConfigValue, setConfigValue } from '../db/app-config.js'
import { decryptSecret, encryptSecret } from './secret-cipher.js'

export const GOOGLE_CLIENT_ID_KEY = 'google_client_id'
export const GOOGLE_CLIENT_SECRET_KEY = 'google_client_secret'

const CACHE_TTL_MS = 60_000
const cache = new Map()

async function readTrimmed(key) {
  const stored = await getConfigValue(key)
  return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null
}

async function readEncrypted(key) {
  const blob = await readTrimmed(key)
  if (!blob) return null

  try {
    return decryptSecret(blob)
  } catch (err) {
    console.error(`Failed to decrypt the stored ${key}:`, err.message)
    return null
  }
}

async function getCachedValue(key, read) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }

  const value = await read(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

async function setCachedValue(key, value) {
  await setConfigValue(key, value)
  cache.delete(key)
}

export async function getGoogleClientId() {
  return getCachedValue(GOOGLE_CLIENT_ID_KEY, readTrimmed)
}

export async function setGoogleClientId(clientId) {
  await setCachedValue(GOOGLE_CLIENT_ID_KEY, clientId)
}

export async function getGoogleClientSecret() {
  return getCachedValue(GOOGLE_CLIENT_SECRET_KEY, readEncrypted)
}

export async function setGoogleClientSecret(clientSecret) {
  await setCachedValue(GOOGLE_CLIENT_SECRET_KEY, clientSecret ? encryptSecret(clientSecret) : '')
}

export function _resetGoogleSettingsCacheForTests() {
  cache.clear()
}
