import { sql, and, gte, isNotNull, desc } from 'drizzle-orm'
import { getDb } from './index.js'
import { conversations, conversationMessages, users } from './schema.js'
import { runCountersByUser } from './agent-runs.js'
import { TOP_USERS_LIMIT } from '../constants.js'

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

function whereAttributed(userColumn, dateColumn, since) {
  return sql`where ${and(isNotNull(userColumn), since ? gte(dateColumn, since) : undefined)}`
}

function conversationsByUser(since) {
  return sql`
    select ${conversations.userId} as "userKey", count(*)::int as "conversations"
    from ${conversations}
    ${whereAttributed(conversations.userId, conversations.createdAt, since)}
    group by "userKey"
  `
}

function messagesByUser(since) {
  return sql`
    select ${conversations.userId} as "userKey",
      (count(*) filter (where ${conversationMessages.role} = ${USER_ROLE}))::int as "userMessages",
      max(${conversationMessages.createdAt}) as "lastMessageAt"
    from ${conversationMessages}
    join ${conversations} on ${conversations.id} = ${conversationMessages.conversationId}
    ${whereAttributed(conversations.userId, conversationMessages.createdAt, since)}
    group by "userKey"
  `
}

function toUserStats(row) {
  return {
    userId: row.userId,
    name: row.name ?? null,
    email: row.email ?? null,
    conversations: Number(row.conversations),
    userMessages: Number(row.userMessages),
    runs: Number(row.runs),
    failedRuns: Number(row.failedRuns),
    requests: Number(row.requests),
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    cachedInputTokens: Number(row.cachedInputTokens),
    cacheWriteTokens: Number(row.cacheWriteTokens),
    lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt) : null,
  }
}

export async function getUserStats(since, limit = TOP_USERS_LIMIT) {
  const { rows } = await getDb().execute(sql`
    with runs as (${runCountersByUser(since)}),
    convs as (${conversationsByUser(since)}),
    msgs as (${messagesByUser(since)}),
    active as (
      select "userKey" from runs
      union
      select "userKey" from convs
      union
      select "userKey" from msgs
    )
    select active."userKey" as "userId",
      ${users.name} as "name",
      ${users.email} as "email",
      coalesce(convs."conversations", 0) as "conversations",
      coalesce(msgs."userMessages", 0) as "userMessages",
      coalesce(runs."runs", 0) as "runs",
      coalesce(runs."failedRuns", 0) as "failedRuns",
      coalesce(runs."requests", 0) as "requests",
      coalesce(runs."inputTokens", 0) as "inputTokens",
      coalesce(runs."outputTokens", 0) as "outputTokens",
      coalesce(runs."cachedInputTokens", 0) as "cachedInputTokens",
      coalesce(runs."cacheWriteTokens", 0) as "cacheWriteTokens",
      greatest(runs."lastRunAt", msgs."lastMessageAt") as "lastActiveAt"
    from active
    left join runs on runs."userKey" = active."userKey"
    left join convs on convs."userKey" = active."userKey"
    left join msgs on msgs."userKey" = active."userKey"
    left join ${users} on ${users.id} = active."userKey"
    order by coalesce(runs."inputTokens", 0) + coalesce(runs."outputTokens", 0) desc,
      coalesce(runs."runs", 0) desc,
      coalesce(convs."conversations", 0) desc
    limit ${limit}
  `)

  return rows.map(toUserStats)
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
