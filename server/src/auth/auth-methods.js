import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Which sign-in methods are enabled, stored in the database (app_config) and
// toggled from the admin panel (Authentication section).
//
// Defaults (no row yet, i.e. fresh install): Google OFF — fail closed until
// the admin explicitly enables it — and password ON, since the bootstrap
// creates a password admin and admin-created users need it.
//
// Note: the password toggle only gates REGULAR users (and the /login form).
// Admins can always sign in with their password — otherwise disabling it
// would lock the admin out of /admin permanently.

export const AUTH_METHODS_KEY = 'auth_methods'

const DEFAULTS = { google: false, password: true }
const CACHE_TTL_MS = 60_000

let cached = null // { value, expiresAt }

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

// Test-only: clear the cache between tests.
export function _resetAuthMethodsCacheForTests() {
  cached = null
}
