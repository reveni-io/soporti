import {
  getBetterstackApiToken,
  getBetterstackConnectHost,
  getBetterstackUsername,
  getBetterstackPassword,
  isBetterstackConfigured,
} from './settings.js'
import { redactSecrets } from '../review/output-guard.js'

const SOURCES_URL = 'https://telemetry.betterstack.com/api/v1/sources'
const SOURCES_PER_PAGE = 50
const SOURCES_CACHE_TTL_MS = 60_000
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_ROWS = 100
const MAX_RAW_CHARS = 1000
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_ERROR_CHARS = 500

const NOT_CONFIGURED_ERROR =
  'Better Stack is not configured. Set the API token, connect host, username and password in the admin panel (Better Stack section).'

let sourcesCache = null

function hasTable(row) {
  return Boolean(row?.attributes?.team_id && row?.attributes?.table_name)
}

function toSource({ id, attributes }) {
  return {
    id,
    name: attributes.name,
    platform: attributes.platform,
    table: `t${attributes.team_id}_${attributes.table_name}`,
    retentionDays: attributes.logs_retention,
  }
}

async function readError(res) {
  const text = await res.text()
  return text.slice(0, MAX_ERROR_CHARS)
}

export async function listSources() {
  const token = await getBetterstackApiToken()
  if (!token) throw new Error(NOT_CONFIGURED_ERROR)

  if (sourcesCache && sourcesCache.token === token && sourcesCache.expiresAt > Date.now()) return sourcesCache.sources

  const res = await fetch(`${SOURCES_URL}?per_page=${SOURCES_PER_PAGE}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Better Stack sources request failed (${res.status}): ${await readError(res)}`)
  }

  const body = await res.json()
  const sources = (body?.data ?? []).filter(hasTable).map(toSource)
  sourcesCache = { token, sources, expiresAt: Date.now() + SOURCES_CACHE_TTL_MS }

  return sources
}

async function resolveSource(name) {
  const wanted = name.trim().toLowerCase()
  const sources = await listSources()

  const match = sources.find(source => source.name.toLowerCase() === wanted || source.table.toLowerCase() === wanted)
  if (!match) {
    const available = sources.map(source => source.name).join(', ') || 'none'
    throw new Error(`Unknown log source "${name}". Available sources: ${available}.`)
  }

  return match
}

async function runSql(sql) {
  const [host, username, password] = await Promise.all([
    getBetterstackConnectHost(),
    getBetterstackUsername(),
    getBetterstackPassword(),
  ])
  if (!host || !username || !password) throw new Error(NOT_CONFIGURED_ERROR)

  const res = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Content-Type': 'text/plain',
    },
    body: sql,
  })
  if (!res.ok) {
    throw new Error(`Better Stack query failed (${res.status}): ${await readError(res)}`)
  }

  return res.text()
}

function parseJsonEachRow(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

function escapeLiteral(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function formatDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function parseBound(value, fallback) {
  if (!value) return fallback

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date "${value}". Use an ISO 8601 timestamp like "2026-07-27T10:00:00Z".`)
  }

  return date
}

function resolveRange(from, to) {
  const toDate = parseBound(to, new Date())
  const fromDate = parseBound(from, new Date(toDate.getTime() - DEFAULT_WINDOW_MS))

  if (fromDate > toDate) throw new Error('"from" must be earlier than "to".')

  return { from: formatDateTime(fromDate), to: formatDateTime(toDate) }
}

function resolveLimit(limit) {
  const parsed = Number(limit)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT

  return Math.min(Math.floor(parsed), MAX_LIMIT)
}

function toLogLine(row) {
  return {
    dt: row.dt,
    raw: redactSecrets(row.raw).slice(0, MAX_RAW_CHARS),
    rawTruncated: row.raw.length > MAX_RAW_CHARS,
  }
}

function redactRow(row) {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => [column, redactSecrets(value)]))
}

export async function isConfigured() {
  return isBetterstackConfigured()
}

export async function describeSource(name) {
  const source = await resolveSource(name)
  const body = JSON.parse(await runSql(`SELECT * FROM remote(${source.table}_logs) LIMIT 0 FORMAT JSON`))

  return {
    source: source.name,
    table: `${source.table}_logs`,
    columns: (body?.meta ?? []).map(column => ({ name: column.name, type: column.type })),
  }
}

export async function searchLogs({ source, query, from, to, limit } = {}) {
  const resolved = await resolveSource(source)
  const needle = query.trim()
  if (!needle) throw new Error('A non-empty "query" is required to search logs.')

  const range = resolveRange(from, to)
  const rowLimit = resolveLimit(limit)
  const where = `dt BETWEEN '${range.from}' AND '${range.to}' AND positionCaseInsensitive(raw, '${escapeLiteral(needle)}') > 0`
  const newest = `ORDER BY dt DESC LIMIT ${rowLimit}`
  const rows = parseJsonEachRow(
    await runSql(
      `SELECT dt, raw FROM (` +
        `SELECT dt, raw FROM remote(${resolved.table}_logs) WHERE ${where} ${newest}` +
        ` UNION ALL ` +
        `SELECT dt, raw FROM s3Cluster(primary, ${resolved.table}_s3) WHERE _row_type = 1 AND ${where} ${newest}` +
        `) ${newest} FORMAT JSONEachRow`
    )
  )

  return {
    source: resolved.name,
    from: range.from,
    to: range.to,
    rowCount: rows.length,
    truncated: rows.length === rowLimit,
    logs: rows.map(toLogLine),
  }
}

export async function runQuery(sql) {
  const trimmed = sql.trim().replace(/;+\s*$/, '')
  const upper = trimmed.toUpperCase()

  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    throw new Error('Only SELECT and WITH (CTE) queries are allowed.')
  }
  if (trimmed.includes(';')) throw new Error('Only a single statement is allowed.')
  if (/\bFORMAT\s+\w+/i.test(trimmed)) {
    throw new Error('Do not add a FORMAT clause; the response format is set automatically.')
  }

  const rows = parseJsonEachRow(await runSql(`SELECT * FROM (${trimmed}) AS _q LIMIT ${MAX_ROWS} FORMAT JSONEachRow`))

  return {
    columns: Object.keys(rows[0] ?? {}),
    rows: rows.map(redactRow),
    rowCount: rows.length,
    truncated: rows.length === MAX_ROWS,
  }
}

export function _resetBetterstackSourcesCacheForTests() {
  sourcesCache = null
}
