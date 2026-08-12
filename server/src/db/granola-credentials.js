import { eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { granolaCredentials } from './schema.js'

export async function getGranolaCredential(userId) {
  const [row] = await getDb()
    .select({ apiKey: granolaCredentials.apiKey })
    .from(granolaCredentials)
    .where(eq(granolaCredentials.userId, userId))
    .limit(1)
  return row?.apiKey ?? null
}

export async function setGranolaCredential(userId, apiKey) {
  await getDb()
    .insert(granolaCredentials)
    .values({ userId, apiKey, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: granolaCredentials.userId,
      set: { apiKey, updatedAt: new Date() },
    })
}

export async function deleteGranolaCredential(userId) {
  await getDb().delete(granolaCredentials).where(eq(granolaCredentials.userId, userId))
}
