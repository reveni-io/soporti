import { eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { oauthClients } from './schema.js'

const clientColumns = {
  clientId: oauthClients.clientId,
  name: oauthClients.name,
  redirectUris: oauthClients.redirectUris,
  createdAt: oauthClients.createdAt,
}

export async function createOAuthClient({ clientId, name, redirectUris }) {
  const [row] = await getDb().insert(oauthClients).values({ clientId, name, redirectUris }).returning(clientColumns)
  return row
}

export async function findOAuthClient(clientId) {
  const [row] = await getDb()
    .select(clientColumns)
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1)
  return row ?? null
}
