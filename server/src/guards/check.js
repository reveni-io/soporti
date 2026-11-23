import {
  GUARD_CHECK_PART,
  GUARD_IDS_SEPARATOR,
  GUARD_RESULT_CASE,
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

export async function checkContent(guard, { request, content, attach = null }) {
  const outcome = describeCheck(await runJevCheck({ project: guard.id, state: { request, content, ...attach } }))

  return {
    guard: guard.name,
    status: outcome.status,
    reason: chatReason(outcome.reason),
    warnings: countWarnings(outcome.jev),
    review: toReview(outcome.jev),
  }
}

function summarizeReviews(reviews) {
  const checked = reviews.every(({ status }) => status === LEGAL_CASE_CHECKED)
  const reason = reviews.find(({ reason }) => reason)?.reason ?? null

  return {
    status: checked ? LEGAL_CASE_CHECKED : LEGAL_CASE_NOT_CHECKED,
    reason,
    warnings: reviews.reduce((total, { warnings }) => total + warnings, 0),
  }
}

async function reviewTicketReply(guard, state) {
  const outcome = describeCheck(await runJevCheck({ project: guard.id, state }))

  return { guard, ...outcome, warnings: countWarnings(outcome.jev) }
}

function toShownReview({ guard, status, reason, warnings, jev }) {
  return { guard: guard.name, status, reason: chatReason(reason), warnings, review: toReview(jev) }
}

export async function checkTicketReply(guards, { userId, request, ticket: ref, reply, cases = null }) {
  const [ticket] = await readLegalTickets(userId, [ref])
  if (!ticket) return null

  const state = {
    request,
    ticket: { source: ticket.source, subject: ticket.subject, customer: ticket.customer },
    customerMessage: ticket.customerMessage,
    dataFacts: reply.dataFacts,
    draft: reply.draft,
    language: reply.language,
  }
  const reviews = await Promise.all(guards.map(guard => reviewTicketReply(guard, state)))
  const summary = summarizeReviews(reviews)
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
    ...summary,
  }
  const id = cases
    ? await saveLegalCase({
        ...legalCase,
        userId,
        guardId: guards.map(guard => guard.id).join(GUARD_IDS_SEPARATOR),
        setVersion: reviews[0].setVersion,
        jev: { request, reviews: reviews.map(({ guard, jev }) => ({ guardId: guard.id, ...jev })) },
        conversationId: cases.conversationId,
        messageHash: ticket.messageHash,
        warningsShownTurn: cases.completedTurns ?? null,
      })
    : null

  return {
    id,
    guard: guards.map(guard => guard.name).join(' + '),
    ...legalCase,
    reason: chatReason(summary.reason),
    reviews: reviews.map(toShownReview),
  }
}

export function toGuardPart(result) {
  if (result.kind === GUARD_RESULT_CASE) return { type: LEGAL_RUN_PART, cases: [result.case] }

  return { type: GUARD_CHECK_PART, ...result.check }
}
