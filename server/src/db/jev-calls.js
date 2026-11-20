import { and, count, eq, gte } from 'drizzle-orm'
import { getDb } from './index.js'
import { jevCalls } from './schema.js'

export async function recordJevCall({ project, setVersion, model, answeredModel = null, status, reason = null }) {
  await getDb().insert(jevCalls).values({ project, setVersion, model, answeredModel, status, reason })
}

export async function countJevCallsSince(project, since) {
  const [row] = await getDb()
    .select({ total: count() })
    .from(jevCalls)
    .where(and(eq(jevCalls.project, project), gte(jevCalls.createdAt, since)))

  return row?.total ?? 0
}

export async function countJevCallsByProjectSince(since) {
  return getDb()
    .select({ project: jevCalls.project, calls: count() })
    .from(jevCalls)
    .where(gte(jevCalls.createdAt, since))
    .groupBy(jevCalls.project)
}
