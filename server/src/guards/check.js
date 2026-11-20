import {
  GUARD_CHECK_PART,
  JEV_CHECK_ANSWERED,
  LEGAL_CASE_CHECKED,
  LEGAL_CASE_NOT_CHECKED,
  LEGAL_RUN_PART,
} from '../constants.js'
import { saveLegalCase } from '../db/legal-cases.js'
import { runJevCheck } from '../jev/check.js'
import { readLegalTickets } from '../legal/tickets.js'

const SERVICE_NAME = 'Jev'
const REVIEW_UNAVAILABLE = 'the review could not run'

function chatReason(reason) {
  return reason?.includes(SERVICE_NAME) ? REVIEW_UNAVAILABLE : reason
}

function describeCheck(check) {
  const setVersion = check.setVersion ?? null
  if (check.status !== JEV_CHECK_ANSWERED) {
    return { status: LEGAL_CASE_NOT_CHECKED, reason: check.reason, setVersion, jev: null }
  }

  const { model, minConfidence, rows } = check

  return { status: LEGAL_CASE_CHECKED, reason: null, setVersion, jev: { setVersion, model, minConfidence, rows } }
}

function countWarnings(jev) {
  return jev ? jev.rows.filter(row => row.flagged || row.unsure).length : 0
}

function toReview(jev) {
  return jev && { setVersion: jev.setVersion, minConfidence: jev.minConfidence, rows: jev.rows }
}

export async function checkContent(guard, content) {
  const outcome = describeCheck(await runJevCheck({ project: guard.id, state: { content } }))

  return {
    guard: guard.name,
    status: outcome.status,
    reason: chatReason(outcome.reason),
    warnings: countWarnings(outcome.jev),
    review: toReview(outcome.jev),
  }
}

export async function checkTicketReply(guard, { userId, ticket: ref, reply, cases = null }) {
  const [ticket] = await readLegalTickets(userId, [ref])
  if (!ticket) return null

  const outcome = describeCheck(
    await runJevCheck({
      project: guard.id,
      state: {
        ticket: { source: ticket.source, subject: ticket.subject, customer: ticket.customer },
        customerMessage: ticket.customerMessage,
        dataFacts: reply.dataFacts,
        draft: reply.draft,
        language: reply.language,
      },
    })
  )
  const legalCase = {
    source: ticket.source,
    ticketId: ticket.ticketId,
    ticketUrl: ticket.url ?? null,
    customer: ticket.customer,
    subject: ticket.subject,
    customerMessage: ticket.customerMessage,
    dataFacts: reply.dataFacts,
    draft: reply.draft,
    language: reply.language,
    ...outcome,
    warnings: countWarnings(outcome.jev),
  }
  const id = cases
    ? await saveLegalCase({
        ...legalCase,
        userId,
        guardId: guard.id,
        conversationId: cases.conversationId,
        messageHash: ticket.messageHash,
      })
    : null
  const { jev, reason, ...shown } = legalCase

  return { id, guard: guard.name, ...shown, reason: chatReason(reason), review: toReview(jev) }
}

export function toGuardPart(result) {
  if (result.kind === 'case') return { type: LEGAL_RUN_PART, cases: [result.case] }

  return { type: GUARD_CHECK_PART, ...result.check }
}
