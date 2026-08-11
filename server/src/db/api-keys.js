import { and, count, eq, isNull } from 'drizzle-orm'
import { getDb } from './index.js'
import { apiKeys, users } from './schema.js'

const apiKeyColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  sources: apiKeys.sources,
  lastUsedAt: apiKeys.lastUsedAt,
  createdAt: apiKeys.createdAt,
}

export async function listApiKeys(userId) {
  return getDb()
    .select(apiKeyColumns)
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(apiKeys.createdAt)
}

export async function countApiKeys(userId) {
  const [row] = await getDb()
    .select({ value: count() })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
  return row?.value ?? 0
}

export async function createApiKey(userId, { name, prefix, keyHash, sources }) {
  const [row] = await getDb()
    .insert(apiKeys)
    .values({ userId, name, prefix, keyHash, sources })
    .returning(apiKeyColumns)
  return row
}

export async function revokeApiKey(id, userId) {
  const [row] = await getDb()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id })
  return Boolean(row)
}

export async function findActiveApiKeyByHash(keyHash) {
  const [row] = await getDb()
    .select({
      id: apiKeys.id,
      sources: apiKeys.sources,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1)
  return row ?? null
}

export async function touchApiKeyLastUsed(id) {
  await getDb().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id))
}
