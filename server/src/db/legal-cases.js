import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { LEGAL_CASE_CHECKED } from '../constants.js'
import { getDb } from './index.js'
import { legalCases, schedules, users } from './schema.js'

const PAGE_SIZE = 5

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

export async function deleteLegalCases(conversationId) {
  await getDb().delete(legalCases).where(eq(legalCases.conversationId, conversationId))
}

function isRunChecked() {
  return sql`bool_and(${legalCases.status} = ${LEGAL_CASE_CHECKED})`
}

export async function countLegalRuns() {
  const runs = getDb()
    .select({ checked: isRunChecked().as('checked') })
    .from(legalCases)
    .where(isNotNull(legalCases.conversationId))
    .groupBy(legalCases.conversationId)
    .as('runs')
  const [row] = await getDb()
    .select({
      checked: sql`count(*) filter (where ${runs.checked})`.mapWith(Number),
      notChecked: sql`count(*) filter (where not ${runs.checked})`.mapWith(Number),
    })
    .from(runs)

  return { checked: row?.checked ?? 0, notChecked: row?.notChecked ?? 0 }
}

export async function listUncheckedLegalRuns(page) {
  const at = sql`to_json(min(${legalCases.createdAt})) #>> '{}'`
  const runs = getDb()
    .select({
      at: at.as('at'),
      query: schedules.question,
      owner: users.email,
      setVersion: sql`max(${legalCases.setVersion})`.as('set_version'),
      reasons: sql`string_agg(distinct ${legalCases.reason}, '; ')`.as('reasons'),
    })
    .from(legalCases)
    .innerJoin(schedules, eq(schedules.id, legalCases.scheduleId))
    .innerJoin(users, eq(users.id, schedules.userId))
    .where(isNotNull(legalCases.conversationId))
    .groupBy(legalCases.conversationId, schedules.question, users.email)
    .having(sql`not ${isRunChecked()}`)
    .as('unchecked_runs')
  const [entries, [{ total }]] = await Promise.all([
    getDb()
      .select()
      .from(runs)
      .orderBy(desc(runs.at))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    getDb()
      .select({ total: sql`count(*)`.mapWith(Number) })
      .from(runs),
  ])

  return { entries, total, page, pageSize: PAGE_SIZE }
}
