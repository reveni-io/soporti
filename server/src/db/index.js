import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import config from '../config.js'
import * as schema from './schema.js'

const { Pool } = pg

const LOG_PREFIX = '[db]'
const __dirname = dirname(fileURLToPath(import.meta.url))

let pool = null
let db = null

export function parseDatabaseConfig(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { connectionString: rawUrl, ssl: false }
  }
  const sslMode = parsed.searchParams.get('sslmode')
  if (sslMode !== null) parsed.searchParams.delete('sslmode')
  const useSsl = sslMode !== null && sslMode !== 'disable'
  return {
    connectionString: parsed.toString(),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  }
}

export function getDb() {
  if (!db) {
    console.log(`${LOG_PREFIX} Creating connection pool`)
    const { connectionString, ssl } = parseDatabaseConfig(config.database.url)
    pool = new Pool({ connectionString, ssl })
    pool.on('error', err => {
      console.error(`${LOG_PREFIX} Pool error:`, err.message)
    })
    db = drizzle(pool, { schema })
  }
  return db
}

export async function runMigrations() {
  const migrationsFolder = resolve(__dirname, '../../drizzle')
  await migrate(getDb(), { migrationsFolder })
  console.log(`${LOG_PREFIX} migrations applied`)
}

export async function shutdown() {
  if (pool) {
    console.log(`${LOG_PREFIX} Shutting down connection pool`)
    await pool.end()
    pool = null
    db = null
  }
}
