import { asc, count, inArray } from 'drizzle-orm'
import { getDb } from './index.js'
import { legalReplies } from './schema.js'

const REPLY_FIELDS = {
  id: legalReplies.id,
  caseId: legalReplies.caseId,
  sentBy: legalReplies.sentBy,
  text: legalReplies.text,
  sentAt: legalReplies.createdAt,
}

export async function saveLegalReply({ caseId, userId, sentBy, text, externalId }) {
  const [row] = await getDb()
    .insert(legalReplies)
    .values({ caseId, userId, sentBy, text, externalId })
    .returning(REPLY_FIELDS)

  return row
}

export async function listLegalReplies(caseIds) {
  if (caseIds.length === 0) return []

  return getDb()
    .select(REPLY_FIELDS)
    .from(legalReplies)
    .where(inArray(legalReplies.caseId, caseIds))
    .orderBy(asc(legalReplies.createdAt))
}

export async function countLegalReplies() {
  const [row] = await getDb().select({ total: count() }).from(legalReplies)

  return row?.total ?? 0
}
