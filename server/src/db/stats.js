import { sql, gte } from 'drizzle-orm'
import { getDb } from './index.js'
import { conversations } from './schema.js'

export const USAGE_WINDOW_DAYS = 7

export async function getUsageStats() {
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const [row] = await getDb()
    .select({
      conversations: sql`count(*)::int`,
      activeUsers: sql`count(distinct ${conversations.userId})::int`,
    })
    .from(conversations)
    .where(gte(conversations.updatedAt, since))

  return {
    conversations: row?.conversations ?? 0,
    activeUsers: row?.activeUsers ?? 0,
  }
}
