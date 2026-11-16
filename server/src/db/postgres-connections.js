import { asc, eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { postgresConnections } from './schema.js'

const SUMMARY_COLUMNS = {
  id: postgresConnections.id,
  name: postgresConnections.name,
  createdAt: postgresConnections.createdAt,
}

const CREDENTIAL_COLUMNS = {
  ...SUMMARY_COLUMNS,
  connectionString: postgresConnections.connectionString,
  updatedAt: postgresConnections.updatedAt,
}

export async function listPostgresConnections() {
  return getDb().select(CREDENTIAL_COLUMNS).from(postgresConnections).orderBy(asc(postgresConnections.name))
}

export async function createPostgresConnection({ name, connectionString }) {
  const [row] = await getDb().insert(postgresConnections).values({ name, connectionString }).returning(SUMMARY_COLUMNS)
  return row
}

export async function updatePostgresConnection(id, changes) {
  const [row] = await getDb()
    .update(postgresConnections)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(postgresConnections.id, id))
    .returning(SUMMARY_COLUMNS)
  return row ?? null
}

export async function deletePostgresConnection(id) {
  const [row] = await getDb()
    .delete(postgresConnections)
    .where(eq(postgresConnections.id, id))
    .returning({ id: postgresConnections.id })
  return Boolean(row)
}
