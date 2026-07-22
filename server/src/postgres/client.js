import pg from 'pg'
import { getPostgresConnection, isPostgresConfigured, getPostgresMaxRows } from './settings.js'

const { Pool } = pg

const LOG_PREFIX = '[postgres]'
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

// Resolves the connection pool, rebuilding it when the stored connection string
// changes (admin edits it) so rotation takes effect without a restart. The
// string lives in the database (admin panel → Database section), so it is
// resolved per acquisition instead of read once from an env var.
async function getPool() {
  const raw = await getPostgresConnection()
  if (!raw) {
    throw new Error('PostgreSQL is not configured. Set the connection string in the admin panel (Database section).')
  }
  const connString = buildConnectionString(raw)

  // From here on there is no `await`, so the null-check and the assignment run
  // atomically within a single microtask — concurrent callers cannot each build
  // a pool.
  if (pool && poolConnString === connString) return pool
  if (pool) {
    // Connection string changed: tear down the stale pool. Fire-and-forget so
    // the common path stays await-free (and atomic).
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

// Async because the connection string lives in the database now. Whether the
// Postgres tools are registered is resolved per turn (see buildAgentTools /
// createAgent).
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

    const db = await getPool()
    const { rows, fields } = await db.query(query)
    console.log(`${LOG_PREFIX} runQuery → ${rows.length} rows, ${fields.length} columns`)
    return {
      columns: fields.map(f => f.name),
      rows,
      rowCount: rows.length,
      truncated: rows.length === maxRows,
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} runQuery error:`, err.message)
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
