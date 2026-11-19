import { and, countDistinct, eq, inArray, min, sql } from 'drizzle-orm'
import { AUTO_APPROVE_SHADOW } from '../constants.js'
import { getDb } from './index.js'
import { autoApproveEvaluations } from './schema.js'

export async function recordAutoApproveEvaluation({ repo, prNumber, headSha, mode, wouldApprove, decidedBy }) {
  await getDb().insert(autoApproveEvaluations).values({ repo, prNumber, headSha, mode, wouldApprove, decidedBy })
}

export async function getShadowStats(repos) {
  const table = autoApproveEvaluations

  return getDb()
    .select({
      repo: table.repo,
      evaluated: countDistinct(table.prNumber),
      wouldApprove: sql`count(distinct ${table.prNumber}) filter (where ${table.wouldApprove})`.mapWith(Number),
      since: min(table.createdAt),
    })
    .from(table)
    .where(and(eq(table.mode, AUTO_APPROVE_SHADOW), inArray(table.repo, repos)))
    .groupBy(table.repo)
}
