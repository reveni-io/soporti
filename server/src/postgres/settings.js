import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const POSTGRES_CONNECTION_KEY = 'postgres_connection'
export const POSTGRES_MAX_ROWS_KEY = 'postgres_max_rows'

export const DEFAULT_MAX_ROWS = 100

const CACHE_TTL_MS = 60_000
const cache = new Map()

async function getCached(key) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }
  const stored = await getConfigValue(key)
  cache.set(key, { value: stored, expiresAt: Date.now() + CACHE_TTL_MS })
  return stored
}

export async function getPostgresConnection() {
  const stored = await getCached(POSTGRES_CONNECTION_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function setPostgresConnection(connection) {
  await setConfigValue(POSTGRES_CONNECTION_KEY, connection)
  cache.delete(POSTGRES_CONNECTION_KEY)
}

export async function isPostgresConfigured() {
  return Boolean(await getPostgresConnection())
}

export async function getPostgresMaxRows() {
  const stored = await getCached(POSTGRES_MAX_ROWS_KEY)
  const n = Number(stored)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_ROWS
  return Math.floor(n)
}

export async function setPostgresMaxRows(value) {
  await setConfigValue(POSTGRES_MAX_ROWS_KEY, value)
  cache.delete(POSTGRES_MAX_ROWS_KEY)
}

export function _resetPostgresSettingsCacheForTests() {
  cache.clear()
}
