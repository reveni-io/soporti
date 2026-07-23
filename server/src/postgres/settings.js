import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Settings for the agent's read-only PostgreSQL query tool, stored in the
// database (app_config) and edited from the admin panel (Database section) — no
// env vars. The database is the single source of truth. This is NOT the app
// database (DATABASE_URL); it is the customer database the agent explores.
//
// Values are read per pool acquisition / per query, so they are cached briefly;
// saves invalidate the cache immediately in this process, the TTL covers other
// instances. The connection string is a secret (it carries a password), so it
// is write-only from the admin's point of view (only whether it is configured
// is ever returned). The row cap is not a secret and is returned as-is.

export const POSTGRES_CONNECTION_KEY = 'postgres_connection'
export const POSTGRES_MAX_ROWS_KEY = 'postgres_max_rows'

// Default row cap. There is no hard ceiling — an admin can set any value >= 1.
// A very large value can overflow the agent's context window, so raise it
// deliberately.
export const DEFAULT_MAX_ROWS = 100

const CACHE_TTL_MS = 60_000
const cache = new Map() // key -> { value, expiresAt }

async function getCached(key) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }
  const stored = await getConfigValue(key)
  cache.set(key, { value: stored, expiresAt: Date.now() + CACHE_TTL_MS })
  return stored
}

// Returns the connection string or null when not configured.
export async function getPostgresConnection() {
  const stored = await getCached(POSTGRES_CONNECTION_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

// An empty string clears the connection (the query tool is disabled).
export async function setPostgresConnection(connection) {
  await setConfigValue(POSTGRES_CONNECTION_KEY, connection)
  cache.delete(POSTGRES_CONNECTION_KEY)
}

// True when a connection string is configured. Async because the value lives in
// the database now (it used to be a synchronous env-derived value).
export async function isPostgresConfigured() {
  return Boolean(await getPostgresConnection())
}

// Returns the effective row cap for query results (>= 1). Falls back to
// DEFAULT_MAX_ROWS when unset or invalid. No upper bound is enforced.
export async function getPostgresMaxRows() {
  const stored = await getCached(POSTGRES_MAX_ROWS_KEY)
  const n = Number(stored)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_ROWS
  return Math.floor(n)
}

// Persists the row cap. Pass null (or an empty value) to clear it and revert to
// the default. Range validation lives in the admin route.
export async function setPostgresMaxRows(value) {
  await setConfigValue(POSTGRES_MAX_ROWS_KEY, value)
  cache.delete(POSTGRES_MAX_ROWS_KEY)
}

// Test-only: clear the cache between tests.
export function _resetPostgresSettingsCacheForTests() {
  cache.clear()
}
