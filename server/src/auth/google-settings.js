import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const GOOGLE_CLIENT_ID_KEY = 'google_client_id'

const CACHE_TTL_MS = 60_000
let cached = null

export async function getGoogleClientId() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const stored = await getConfigValue(GOOGLE_CLIENT_ID_KEY)
  const value = typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function setGoogleClientId(clientId) {
  await setConfigValue(GOOGLE_CLIENT_ID_KEY, clientId)
  cached = null
}

export function _resetGoogleSettingsCacheForTests() {
  cached = null
}
