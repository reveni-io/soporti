import { sql, gte, desc } from 'drizzle-orm'
import { getDb } from './index.js'
import { conversations, conversationMessages } from './schema.js'

export const USAGE_WINDOW_DAYS = 7

const USER_ROLE = 'user'

const CONVERSATION_AGGREGATES = {
  conversations: sql`count(*)::int`,
  activeUsers: sql`count(distinct ${conversations.userId})::int`,
}

export async function getUsageStats() {
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const [row] = await getDb()
    .select(CONVERSATION_AGGREGATES)
    .from(conversations)
    .where(gte(conversations.updatedAt, since))

  return {
    conversations: row?.conversations ?? 0,
    activeUsers: row?.activeUsers ?? 0,
  }
}

export async function getConversationStats(since) {
  const createdSince = since ? gte(conversations.createdAt, since) : undefined

  const [[totals], bySource] = await Promise.all([
    getDb().select(CONVERSATION_AGGREGATES).from(conversations).where(createdSince),
    getDb()
      .select({ source: conversations.source, conversations: sql`count(*)::int` })
      .from(conversations)
      .where(createdSince)
      .groupBy(conversations.source)
      .orderBy(desc(sql`count(*)`)),
  ])

  return {
    conversations: totals?.conversations ?? 0,
    activeUsers: totals?.activeUsers ?? 0,
    bySource,
  }
}

export async function getMessageStats(since) {
  const [row] = await getDb()
    .select({
      messages: sql`count(*)::int`,
      userMessages: sql`(count(*) filter (where ${conversationMessages.role} = ${USER_ROLE}))::int`,
    })
    .from(conversationMessages)
    .where(since ? gte(conversationMessages.createdAt, since) : undefined)

  return {
    messages: row?.messages ?? 0,
    userMessages: row?.userMessages ?? 0,
  }
}
