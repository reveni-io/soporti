import { getConfigValue, setConfigValue } from '../db/app-config.js'
import {
  createPostgresConnection,
  deletePostgresConnection,
  listPostgresConnections,
  updatePostgresConnection,
} from '../db/postgres-connections.js'

export const POSTGRES_MAX_ROWS_KEY = 'postgres_max_rows'
export const DUPLICATE_POSTGRES_CONNECTION = 'DUPLICATE_POSTGRES_CONNECTION'
export const DUPLICATE_POSTGRES_CONNECTION_MESSAGE = 'A database with this name is already connected.'

export const DEFAULT_MAX_ROWS = 100

const NAME_MAX_LENGTH = 60
const CONNECTION_STRING_MAX_LENGTH = 2000
const LINE_BREAK_RE = /[\r\n]/
const CACHE_TTL_MS = 60_000
const CONNECTIONS_CACHE_KEY = 'connections'
const NAME_ERROR = `The name must be between 1 and ${NAME_MAX_LENGTH} characters, on a single line.`
const CONNECTION_STRING_ERROR = 'That does not look like a valid PostgreSQL connection string.'
const EMPTY_CHANGES_ERROR = 'Send a new name or a new connection string.'
const cache = new Map()

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isValidName(name) {
  return name.length > 0 && name.length <= NAME_MAX_LENGTH && !LINE_BREAK_RE.test(name)
}

function isValidConnectionString(connectionString) {
  return (
    connectionString.length > 0 &&
    connectionString.length <= CONNECTION_STRING_MAX_LENGTH &&
    !LINE_BREAK_RE.test(connectionString)
  )
}

export function parsePostgresConnection({ name, connectionString } = {}) {
  const connection = { name: trimmed(name), connectionString: trimmed(connectionString) }

  if (!isValidName(connection.name)) return { error: NAME_ERROR }
  if (!isValidConnectionString(connection.connectionString)) return { error: CONNECTION_STRING_ERROR }

  return { value: connection }
}

function isProvided(value) {
  return value !== undefined && value !== null
}

export function parsePostgresConnectionChanges({ name, connectionString } = {}) {
  const changes = {}

  if (isProvided(name)) {
    changes.name = trimmed(name)
    if (!isValidName(changes.name)) return { error: NAME_ERROR }
  }
  if (isProvided(connectionString)) {
    changes.connectionString = trimmed(connectionString)
    if (!isValidConnectionString(changes.connectionString)) return { error: CONNECTION_STRING_ERROR }
  }
  if (Object.keys(changes).length === 0) return { error: EMPTY_CHANGES_ERROR }

  return { value: changes }
}

async function getCached(key, load) {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) return entry.value

  const value = await load()
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })

  return value
}

export async function getPostgresConnections() {
  return getCached(CONNECTIONS_CACHE_KEY, listPostgresConnections)
}

export function describePostgresConnection({ id, name, createdAt }) {
  return { id, name, createdAt }
}

function sameName(left, right) {
  return left.toLowerCase() === right.toLowerCase()
}

function duplicateError() {
  const err = new Error(DUPLICATE_POSTGRES_CONNECTION_MESSAGE)
  err.code = DUPLICATE_POSTGRES_CONNECTION

  return err
}

async function assertNameAvailable(name, ownId = null) {
  const existing = await getPostgresConnections()
  const taken = existing.some(candidate => candidate.id !== ownId && sameName(candidate.name, name))

  if (taken) throw duplicateError()
}

export async function addPostgresConnection({ name, connectionString }) {
  await assertNameAvailable(name)

  const created = await createPostgresConnection({ name, connectionString })
  cache.delete(CONNECTIONS_CACHE_KEY)

  return created
}

export async function editPostgresConnection(id, changes) {
  if (changes.name) await assertNameAvailable(changes.name, id)

  const updated = await updatePostgresConnection(id, changes)
  cache.delete(CONNECTIONS_CACHE_KEY)

  return updated
}

export async function removePostgresConnection(id) {
  const removed = await deletePostgresConnection(id)
  cache.delete(CONNECTIONS_CACHE_KEY)

  return removed
}

export async function isPostgresConfigured() {
  return (await getPostgresConnections()).length > 0
}

export async function getPostgresMaxRows() {
  const stored = await getCached(POSTGRES_MAX_ROWS_KEY, () => getConfigValue(POSTGRES_MAX_ROWS_KEY))
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
