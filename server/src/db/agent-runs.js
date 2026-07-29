import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { getDb } from './index.js'
import { agentRuns } from './schema.js'
import { RUN_STATUS_ERROR, RUN_STATUS_OK, TOP_TOOLS_LIMIT } from '../constants.js'

const P50 = 0.5
const P95 = 0.95

function sinceFilter(since) {
  return since ? gte(agentRuns.createdAt, since) : undefined
}

function okDuration(quantile) {
  return sql`coalesce(percentile_cont(${quantile}::double precision) within group (order by case when ${agentRuns.status} = ${RUN_STATUS_OK} then ${agentRuns.durationMs}::double precision end), 0)::int`
}

const RUN_AGGREGATES = {
  runs: sql`count(*)::int`,
  failedRuns: sql`(count(*) filter (where ${agentRuns.status} = ${RUN_STATUS_ERROR}))::int`,
  requests: sql`coalesce(sum(${agentRuns.requests}), 0)::bigint`,
  inputTokens: sql`coalesce(sum(${agentRuns.inputTokens}), 0)::bigint`,
  outputTokens: sql`coalesce(sum(${agentRuns.outputTokens}), 0)::bigint`,
  cachedInputTokens: sql`coalesce(sum(${agentRuns.cachedInputTokens}), 0)::bigint`,
  cacheWriteTokens: sql`coalesce(sum(${agentRuns.cacheWriteTokens}), 0)::bigint`,
  p50DurationMs: okDuration(P50),
  p95DurationMs: okDuration(P95),
}

export async function recordAgentRun({ channel, status, subject = null, usage = null, durationMs = 0, tools = [] }) {
  try {
    await getDb()
      .insert(agentRuns)
      .values({
        channel,
        status,
        subject,
        requests: usage?.requests ?? 0,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cachedInputTokens: usage?.cachedInputTokens ?? 0,
        cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
        durationMs: Math.round(durationMs),
        tools,
      })
  } catch (err) {
    console.error('Failed to record the agent run:', err)
  }
}

export async function getRunTotals(since) {
  const [row] = await getDb().select(RUN_AGGREGATES).from(agentRuns).where(sinceFilter(since))
  return normalizeAggregates(row)
}

export async function getRunsByChannel(since) {
  const rows = await getDb()
    .select({ channel: agentRuns.channel, ...RUN_AGGREGATES })
    .from(agentRuns)
    .where(sinceFilter(since))
    .groupBy(agentRuns.channel)
    .orderBy(desc(sql`count(*)`))

  return rows.map(row => ({ channel: row.channel, ...normalizeAggregates(row) }))
}

export async function countDistinctSubjects(channel, since) {
  const [row] = await getDb()
    .select({ total: sql`count(distinct ${agentRuns.subject})::int` })
    .from(agentRuns)
    .where(and(eq(agentRuns.channel, channel), eq(agentRuns.status, RUN_STATUS_OK), sinceFilter(since)))

  return row?.total ?? 0
}

export async function getTopTools(since, limit = TOP_TOOLS_LIMIT) {
  return getDb()
    .select({ tool: sql`tool`, calls: sql`count(*)::int` })
    .from(sql`${agentRuns} cross join lateral jsonb_array_elements_text(${agentRuns.tools}) as tool`)
    .where(sinceFilter(since))
    .groupBy(sql`tool`)
    .orderBy(desc(sql`count(*)`))
    .limit(limit)
}

function normalizeAggregates(row) {
  return {
    runs: row?.runs ?? 0,
    failedRuns: row?.failedRuns ?? 0,
    requests: Number(row?.requests ?? 0),
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    cachedInputTokens: Number(row?.cachedInputTokens ?? 0),
    cacheWriteTokens: Number(row?.cacheWriteTokens ?? 0),
    p50DurationMs: row?.p50DurationMs ?? 0,
    p95DurationMs: row?.p95DurationMs ?? 0,
  }
}
