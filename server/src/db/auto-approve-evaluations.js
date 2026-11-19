import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { AUTO_APPROVE_SHADOW } from '../constants.js'
import { getDb } from './index.js'
import { autoApproveEvaluations } from './schema.js'

export async function recordAutoApproveEvaluation({ repo, prNumber, headSha, mode, wouldApprove, decidedBy }) {
  await getDb().insert(autoApproveEvaluations).values({ repo, prNumber, headSha, mode, wouldApprove, decidedBy })
}

export async function getShadowStats(repos) {
  const table = autoApproveEvaluations
  const latest = getDb()
    .selectDistinctOn([table.repo, table.prNumber], {
      repo: table.repo,
      wouldApprove: table.wouldApprove,
      firstAt: sql`min(${table.createdAt}) over (partition by ${table.repo}, ${table.prNumber})`.as('first_at'),
    })
    .from(table)
    .where(and(eq(table.mode, AUTO_APPROVE_SHADOW), inArray(table.repo, repos)))
    .orderBy(table.repo, table.prNumber, desc(table.createdAt))
    .as('latest')

  return getDb()
    .select({
      repo: latest.repo,
      evaluated: count(),
      wouldApprove: sql`count(*) filter (where ${latest.wouldApprove})`.mapWith(Number),
      since: sql`min(${latest.firstAt})`.mapWith(table.createdAt),
    })
    .from(latest)
    .groupBy(latest.repo)
}
