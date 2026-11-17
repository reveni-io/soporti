import { eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { googleConnections } from './schema.js'

export async function getGoogleConnection(userId) {
  const [row] = await getDb()
    .select({
      email: googleConnections.email,
      refreshToken: googleConnections.refreshToken,
      scopes: googleConnections.scopes,
    })
    .from(googleConnections)
    .where(eq(googleConnections.userId, userId))
    .limit(1)
  return row ?? null
}

export async function upsertGoogleConnection(userId, { email, refreshToken, scopes }) {
  const updatedAt = new Date()

  await getDb()
    .insert(googleConnections)
    .values({ userId, email, refreshToken, scopes, updatedAt })
    .onConflictDoUpdate({
      target: googleConnections.userId,
      set: { email, refreshToken, scopes, updatedAt },
    })
}

export async function deleteGoogleConnection(userId) {
  await getDb().delete(googleConnections).where(eq(googleConnections.userId, userId))
}
