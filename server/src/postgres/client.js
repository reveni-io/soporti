import pg from 'pg'
import { getPostgresConnection, isPostgresConfigured, getPostgresMaxRows } from './settings.js'

const { Pool } = pg

const LOG_PREFIX = '[postgres]'
const UNDEFINED_COLUMN_CODE = '42703'
const UNDEFINED_TABLE_CODE = '42P01'
const QUERY_CANCELED_CODE = '57014'
const MISSING_RELATION_RE = /relation "([^"]+)" does not exist/
const TRAILING_PLURAL_S_RE = /(?<=.{3})s$/i
const STATEMENT_TIMEOUT_RE = /statement timeout/
const MAX_SIMILAR_TABLES = 10
const STATEMENT_TIMEOUT_HINT =
  'The query ran longer than the database allows. Narrow it: filter on indexed columns such as ids or a range on a date column, avoid ILIKE or leading wildcards on large tables, and split a large join into smaller queries.'
const SYSTEM_SCHEMAS = ['information_schema', 'pg_catalog', 'pg_toast']
const MAX_SUGGESTED_TABLES = 5
const IDENTIFIER_RE = /[a-z_][a-z0-9_$]*/g
const BEGIN_READ_ONLY = 'BEGIN READ ONLY'
const ROLLBACK = 'ROLLBACK'
const EXTENDED_QUERY_MODE = 'extended'
let pool = null
let poolConnString = null

function buildConnectionString(raw) {
  try {
    const url = new URL(raw)
    url.searchParams.delete('sslmode')
    return url.toString()
  } catch {
    return raw
  }
}

async function getPool() {
  const raw = await getPostgresConnection()
  if (!raw) {
    throw new Error('PostgreSQL is not configured. Set the connection string in the admin panel (Database section).')
  }
  const connString = buildConnectionString(raw)

  if (pool && poolConnString === connString) return pool
  if (pool) {
    const stale = pool
    pool = null
    poolConnString = null
    stale.end().catch(err => console.error(`${LOG_PREFIX} Error closing stale pool:`, err.message))
  }

  console.log(`${LOG_PREFIX} Creating connection pool (max=3)`)
  pool = new Pool({
    connectionString: connString,
    max: 3,
    ssl: { rejectUnauthorized: false },
  })
  poolConnString = connString

  pool.on('error', err => {
    console.error(`${LOG_PREFIX} Pool error:`, err.message)
  })

  pool.on('connect', () => {
    console.log(`${LOG_PREFIX} New client connected`)
  })

  return pool
}

export async function isConfigured() {
  return isPostgresConfigured()
}

export async function listSchemas() {
  console.log(`${LOG_PREFIX} listSchemas()`)
  try {
    const db = await getPool()
    const { rows } = await db.query(
      `SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
       ORDER BY schema_name`
    )
    console.log(`${LOG_PREFIX} listSchemas → ${rows.length} schemas`)
    return rows.map(r => r.schema_name)
  } catch (err) {
    console.error(`${LOG_PREFIX} listSchemas error:`, err.message)
    throw err
  }
}

export async function listTables(schema = 'public') {
  console.log(`${LOG_PREFIX} listTables(${schema})`)
  try {
    const db = await getPool()
    const { rows } = await db.query(
      `SELECT t.table_name, t.table_type,
              pg_stat_user_tables.n_live_tup AS approx_row_count
       FROM information_schema.tables t
       LEFT JOIN pg_stat_user_tables
         ON pg_stat_user_tables.schemaname = t.table_schema
         AND pg_stat_user_tables.relname = t.table_name
       WHERE t.table_schema = $1
       ORDER BY t.table_name`,
      [schema]
    )
    console.log(`${LOG_PREFIX} listTables → ${rows.length} tables in "${schema}"`)
    return rows.map(r => ({
      name: r.table_name,
      type: r.table_type,
      approxRows: Number(r.approx_row_count) || 0,
    }))
  } catch (err) {
    console.error(`${LOG_PREFIX} listTables error:`, err.message)
    throw err
  }
}

export async function describeTable(schema, table) {
  console.log(`${LOG_PREFIX} describeTable(${schema}, ${table})`)
  try {
    const db = await getPool()
    const columnsQuery = db.query(
      `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
      [schema, table]
    )

    const pkQuery = db.query(
      `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_schema = $1
       AND tc.table_name = $2
     ORDER BY kcu.ordinal_position`,
      [schema, table]
    )

    const fkQuery = db.query(
      `SELECT kcu.column_name,
            ccu.table_schema AS foreign_schema,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = $1
       AND tc.table_name = $2`,
      [schema, table]
    )

    const [columns, pks, fks] = await Promise.all([columnsQuery, pkQuery, fkQuery])

    const pkColumns = new Set(pks.rows.map(r => r.column_name))

    const result = {
      columns: columns.rows.map(c => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        default: c.column_default,
        primaryKey: pkColumns.has(c.column_name),
      })),
      foreignKeys: fks.rows.map(fk => ({
        column: fk.column_name,
        references: `${fk.foreign_schema}.${fk.foreign_table}.${fk.foreign_column}`,
      })),
    }
    console.log(`${LOG_PREFIX} describeTable → ${columns.rows.length} columns, ${fks.rows.length} FKs`)
    return result
  } catch (err) {
    console.error(`${LOG_PREFIX} describeTable error:`, err.message)
    throw err
  }
}

function identifierTokens(sql) {
  return [...new Set(sql.toLowerCase().match(IDENTIFIER_RE) ?? [])]
}

function groupColumnsByTable(rows) {
  const tables = new Map()

  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`
    if (!tables.has(key)) tables.set(key, [])
    tables.get(key).push(row.column_name)
  }

  return [...tables].slice(0, MAX_SUGGESTED_TABLES).map(([table, columns]) => ({ table, columns }))
}

async function describeTablesInQuery(sql) {
  try {
    const db = await getPool()
    const { rows } = await db.query(
      `SELECT table_schema, table_name, column_name
     FROM information_schema.columns
     WHERE lower(table_name) = ANY($1::text[]) AND table_schema <> ALL($2::text[])
     ORDER BY array_position($1::text[], lower(table_name)), table_schema, table_name, ordinal_position`,
      [identifierTokens(sql), SYSTEM_SCHEMAS]
    )

    return groupColumnsByTable(rows)
  } catch (err) {
    console.error(`${LOG_PREFIX} describeTablesInQuery error:`, err.message)
    return []
  }
}

function describeColumns(tables) {
  if (tables.length === 0) return null

  const listed = tables.map(({ table, columns }) => `${table}: ${columns.join(', ')}`).join('; ')

  return `Columns of the tables in this query: ${listed}.`
}

function withHint(err, hint) {
  const message = [err.message, err.hint, hint].filter(Boolean).join(' ')

  return Object.assign(new Error(message, { cause: err }), { code: err.code })
}

async function undefinedColumnError(err, sql) {
  const tables = await describeTablesInQuery(sql)

  return withHint(err, describeColumns(tables))
}

async function findTablesNamedLike(name) {
  try {
    const db = await getPool()
    const { rows } = await db.query(
      `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE position(lower($1) in lower(table_name)) > 0 AND table_schema <> ALL($2::text[])
     ORDER BY length(table_name), table_schema, table_name
     LIMIT $3`,
      [name, SYSTEM_SCHEMAS, MAX_SIMILAR_TABLES]
    )

    return rows.map(row => `${row.table_schema}.${row.table_name}`)
  } catch (err) {
    console.error(`${LOG_PREFIX} findTablesNamedLike error:`, err.message)
    return []
  }
}

async function undefinedTableError(err) {
  const missing = err.message.match(MISSING_RELATION_RE)?.[1]?.split('.').at(-1)?.replace(TRAILING_PLURAL_S_RE, '')
  if (!missing) return err

  const tables = await findTablesNamedLike(missing)
  if (tables.length === 0)
    return withHint(err, `No table name contains "${missing}": list them with list_database_tables.`)

  return withHint(err, `Tables whose name contains "${missing}": ${tables.join(', ')}.`)
}

function canceledQueryError(err) {
  if (!STATEMENT_TIMEOUT_RE.test(err.message)) return err

  return withHint(err, STATEMENT_TIMEOUT_HINT)
}

const QUERY_ERROR_EXPLAINERS = {
  [UNDEFINED_COLUMN_CODE]: undefinedColumnError,
  [UNDEFINED_TABLE_CODE]: undefinedTableError,
  [QUERY_CANCELED_CODE]: canceledQueryError,
}

function logConnectionError(err) {
  console.error(`${LOG_PREFIX} Connection error during a query:`, err.message)
}

async function queryReadOnly(text) {
  const db = await getPool()
  const client = await db.connect()
  client.on('error', logConnectionError)

  try {
    await client.query(BEGIN_READ_ONLY)
    return await client.query({ text, queryMode: EXTENDED_QUERY_MODE })
  } finally {
    const rollbackError = await client.query(ROLLBACK).then(
      () => undefined,
      err => err
    )
    client.removeListener('error', logConnectionError)
    client.release(rollbackError)
  }
}

export async function runQuery(sql) {
  console.log(`${LOG_PREFIX} runQuery: ${sql.slice(0, 200)}${sql.length > 200 ? '...' : ''}`)
  const trimmed = sql.trim()
  const upper = trimmed.toUpperCase()
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    console.error(`${LOG_PREFIX} runQuery rejected: not a SELECT/WITH query`)
    throw new Error('Only SELECT and WITH (CTE) queries are allowed.')
  }

  try {
    const maxRows = await getPostgresMaxRows()
    const limited = trimmed.replace(/;+\s*$/, '')
    const query = `SELECT * FROM (${limited}) AS _q LIMIT ${maxRows}`

    const { rows, fields } = await queryReadOnly(query)
    console.log(`${LOG_PREFIX} runQuery → ${rows.length} rows, ${fields.length} columns`)
    return {
      columns: fields.map(f => f.name),
      rows,
      rowCount: rows.length,
      truncated: rows.length === maxRows,
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} runQuery error:`, err.message)
    const explain = QUERY_ERROR_EXPLAINERS[err.code]
    if (explain) throw await explain(err, trimmed)
    throw err
  }
}

export async function shutdown() {
  if (pool) {
    console.log(`${LOG_PREFIX} Shutting down connection pool`)
    const p = pool
    pool = null
    poolConnString = null
    await p.end()
  }
}
