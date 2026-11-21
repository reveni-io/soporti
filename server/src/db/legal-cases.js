import { and, count, eq, gte, inArray } from 'drizzle-orm'
import { getDb } from './index.js'
import { legalCases, legalReplies } from './schema.js'

export async function saveLegalCase(legalCase) {
  const [row] = await getDb().insert(legalCases).values(legalCase).returning({ id: legalCases.id })

  return row?.id ?? null
}

const OWNED_CASE_FIELDS = {
  id: legalCases.id,
  guardId: legalCases.guardId,
  source: legalCases.source,
  ticketId: legalCases.ticketId,
  ticketUrl: legalCases.ticketUrl,
  customer: legalCases.customer,
  status: legalCases.status,
  warnings: legalCases.warnings,
  draft: legalCases.draft,
  conversationId: legalCases.conversationId,
  createdAt: legalCases.createdAt,
}

export async function findOwnedLegalCases(ids, userId) {
  if (ids.length === 0) return []

  return getDb()
    .select(OWNED_CASE_FIELDS)
    .from(legalCases)
    .where(and(inArray(legalCases.id, ids), eq(legalCases.userId, userId)))
}

export async function getOwnedLegalCase(id, userId) {
  const [row] = await findOwnedLegalCases([id], userId)

  return row ?? null
}

export async function deleteLegalCases(conversationId) {
  await getDb().delete(legalCases).where(eq(legalCases.conversationId, conversationId))
}

export async function countCasesByGuardSince(since) {
  return getDb()
    .select({ guardId: legalCases.guardId, cases: count() })
    .from(legalCases)
    .where(gte(legalCases.createdAt, since))
    .groupBy(legalCases.guardId)
}

export async function countSentRepliesByGuardSince(since) {
  return getDb()
    .select({ guardId: legalCases.guardId, replies: count() })
    .from(legalReplies)
    .innerJoin(legalCases, eq(legalCases.id, legalReplies.caseId))
    .where(gte(legalReplies.createdAt, since))
    .groupBy(legalCases.guardId)
}
