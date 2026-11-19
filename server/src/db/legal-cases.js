import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from './index.js'
import { legalCases } from './schema.js'

function caseKey({ source, ticketId, messageHash }) {
  return `${source}:${ticketId}:${messageHash}`
}

export async function findDraftedLegalCases(scheduleId, tickets) {
  if (tickets.length === 0) return new Set()

  const rows = await getDb()
    .select({ source: legalCases.source, ticketId: legalCases.ticketId, messageHash: legalCases.messageHash })
    .from(legalCases)
    .where(
      and(
        eq(legalCases.scheduleId, scheduleId),
        inArray(
          legalCases.messageHash,
          tickets.map(ticket => ticket.messageHash)
        )
      )
    )

  return new Set(rows.map(caseKey))
}

export function isDrafted(drafted, ticket) {
  return drafted.has(caseKey(ticket))
}

export async function saveLegalCase(legalCase) {
  await getDb().insert(legalCases).values(legalCase).onConflictDoNothing()
}
