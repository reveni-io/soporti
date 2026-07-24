import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const AUTH_METHODS_KEY = 'auth_methods'

const DEFAULTS = { google: false, password: true }
const CACHE_TTL_MS = 60_000

let cached = null

export async function getAuthMethods() {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }
  const stored = await getConfigValue(AUTH_METHODS_KEY)
  const value = {
    google: typeof stored?.google === 'boolean' ? stored.google : DEFAULTS.google,
    password: typeof stored?.password === 'boolean' ? stored.password : DEFAULTS.password,
  }
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function setAuthMethods({ google, password }) {
  const value = { google, password }
  await setConfigValue(AUTH_METHODS_KEY, value)
  cached = null
  return value
}

export function _resetAuthMethodsCacheForTests() {
  cached = null
}
