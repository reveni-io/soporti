import { ReadOnlyQueryError, runTypedQuery } from '../postgres/client.js'
import { executeShared, readCachedResult } from './query-cache.js'
import {
  ANALYTICS_KIND_NUMBER,
  ANALYTICS_MAX_ROWS,
  POSTGRES_OID_DATE,
  POSTGRES_OID_TIMESTAMP,
  POSTGRES_OID_TIMESTAMPTZ,
} from '../constants.js'

const STATEMENT_TIMEOUT_MS = 30_000
const SQLSTATE_RE = /^(?!E)[0-9A-Z]{5}$/
const CONNECTION_SQLSTATE_RE = /^(08|28|3D|53|57P)/
const UNREACHABLE_ERROR = 'The database could not be reached. Check the connection in /admin (Database section).'
const WALL_CLOCK_RE = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:[+-]\d{2}(?::\d{2}){0,2})?)?$/
const MIDNIGHT = '00:00:00'
const MILLISECOND_DIGITS = 3

const OID_BOOL = 16
const OID_INT8 = 20
const OID_INT2 = 21
const OID_INT4 = 23
const OID_FLOAT4 = 700
const OID_FLOAT8 = 701
const OID_NUMERIC = 1700

const KIND_DATE = 'date'
const KIND_BOOLEAN = 'boolean'
const KIND_TEXT = 'text'
const COLUMN_KINDS = {
  [OID_INT2]: ANALYTICS_KIND_NUMBER,
  [OID_INT4]: ANALYTICS_KIND_NUMBER,
  [OID_INT8]: ANALYTICS_KIND_NUMBER,
  [OID_FLOAT4]: ANALYTICS_KIND_NUMBER,
  [OID_FLOAT8]: ANALYTICS_KIND_NUMBER,
  [OID_NUMERIC]: ANALYTICS_KIND_NUMBER,
  [POSTGRES_OID_DATE]: KIND_DATE,
  [POSTGRES_OID_TIMESTAMP]: KIND_DATE,
  [POSTGRES_OID_TIMESTAMPTZ]: KIND_DATE,
  [OID_BOOL]: KIND_BOOLEAN,
}
const VALUE_CONVERTERS = {
  [OID_INT8]: toNumber,
  [OID_NUMERIC]: toNumber,
  [POSTGRES_OID_DATE]: toWallClock,
  [POSTGRES_OID_TIMESTAMP]: toWallClock,
  [POSTGRES_OID_TIMESTAMPTZ]: toWallClock,
}

export class QueryError extends Error {}

function isQueryMistake(err) {
  if (err instanceof ReadOnlyQueryError) return true

  return SQLSTATE_RE.test(err.code ?? '') && !CONNECTION_SQLSTATE_RE.test(err.code)
}

function toQueryError(err) {
  if (isQueryMistake(err)) return new QueryError(err.message, { cause: err })

  console.error('[analytics] Failed to run a chart query:', err)

  return new QueryError(UNREACHABLE_ERROR, { cause: err })
}

function uniqueFields(fields) {
  return [...new Map(fields.map(field => [field.name, field])).values()]
}

function toNumber(value) {
  if (typeof value !== 'string') return value

  const number = Number(value)

  return Number.isFinite(number) ? number : value
}

function toWallClock(value) {
  if (typeof value !== 'string') return value

  const match = WALL_CLOCK_RE.exec(value)
  if (!match) return value

  const [, day, time = MIDNIGHT, fraction = ''] = match
  const milliseconds = fraction.slice(0, MILLISECOND_DIGITS).padEnd(MILLISECOND_DIGITS, '0')

  return `${day}T${time}.${milliseconds}Z`
}

function convertRow(row, conversions) {
  const converted = { ...row }
  for (const [name, convert] of conversions) converted[name] = convert(row[name])

  return converted
}

function convertRows(rows, fields) {
  const conversions = fields
    .filter(field => VALUE_CONVERTERS[field.dataTypeID])
    .map(field => [field.name, VALUE_CONVERTERS[field.dataTypeID]])
  if (conversions.length === 0) return rows

  return rows.map(row => convertRow(row, conversions))
}

async function runGuarded(sql) {
  try {
    return await runTypedQuery(sql, { maxRows: ANALYTICS_MAX_ROWS, timeoutMs: STATEMENT_TIMEOUT_MS })
  } catch (err) {
    throw toQueryError(err)
  }
}

async function executeChartQuery(sql) {
  const { fields, rows, truncated } = await runGuarded(sql)
  const unique = uniqueFields(fields)

  return {
    columns: unique.map(({ name, dataTypeID }) => ({ name, kind: COLUMN_KINDS[dataTypeID] ?? KIND_TEXT })),
    rows: convertRows(rows, unique),
    truncated,
    fetchedAt: new Date().toISOString(),
  }
}

export function runChartQuery(sql) {
  return executeShared(sql, () => executeChartQuery(sql))
}

export async function readChartQuery(sql) {
  return readCachedResult(sql) ?? runChartQuery(sql)
}
