import { eq } from 'drizzle-orm'
import { getDb } from './index.js'
import { appConfig } from './schema.js'

// Runtime-editable settings, stored as jsonb by key. Each key defines its own
// value shape (see auth/allowed-domains.js for an example consumer).

export async function getConfigValue(key) {
  const [row] = await getDb().select({ value: appConfig.value }).from(appConfig).where(eq(appConfig.key, key)).limit(1)
  return row?.value ?? null
}

export async function setConfigValue(key, value) {
  await getDb()
    .insert(appConfig)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    })
}
