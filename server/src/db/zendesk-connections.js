import { eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { zendeskConnections } from './schema.js'

const CONNECTION_COLUMNS = {
  subdomain: zendeskConnections.subdomain,
  email: zendeskConnections.email,
  apiToken: zendeskConnections.apiToken,
  writesEnabled: zendeskConnections.writesEnabled,
  viewId: zendeskConnections.viewId,
}

export async function getZendeskConnection(userId) {
  const [row] = await getDb()
    .select(CONNECTION_COLUMNS)
    .from(zendeskConnections)
    .where(eq(zendeskConnections.userId, userId))
    .limit(1)
  return row ?? null
}

export async function saveZendeskCredentials(userId, { subdomain, email, apiToken }) {
  const [row] = await getDb()
    .insert(zendeskConnections)
    .values({ userId, subdomain, email, apiToken, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: zendeskConnections.userId,
      set: { subdomain, email, apiToken, updatedAt: new Date() },
    })
    .returning(CONNECTION_COLUMNS)
  return row
}

export async function updateZendeskOptions(userId, options) {
  const [row] = await getDb()
    .update(zendeskConnections)
    .set({ ...options, updatedAt: new Date() })
    .where(eq(zendeskConnections.userId, userId))
    .returning(CONNECTION_COLUMNS)
  return row ?? null
}

export async function deleteZendeskConnection(userId) {
  await getDb().delete(zendeskConnections).where(eq(zendeskConnections.userId, userId))
}
