import { z } from 'zod'
import { JEV_CHECK_ANSWERED, JEV_LEGAL_DOCUMENT, LEGAL_CASE_CHECKED, LEGAL_CASE_NOT_CHECKED } from '../constants.js'
import { findDraftedLegalCases, isDrafted, saveLegalCase } from '../db/legal-cases.js'
import { runJevCheck } from '../jev/check.js'
import { loadCustomInstructions, runUnattended } from '../schedules/unattended-run.js'
import { buildDraftTask, buildTicketSearchTask } from './prompt.js'
import { LEGAL_SOURCES, readLegalTickets } from './tickets.js'

const MAX_CASES_PER_RUN = 20
const LEGAL_RUN_PART = 'legal-run'

const ticketRefsSchema = z.object({
  tickets: z.array(z.object({ source: z.enum(LEGAL_SOURCES), ticketId: z.string() })),
})

const draftSchema = z.object({
  dataFacts: z.array(z.object({ fact: z.string(), source: z.string() })),
  draft: z.object({ subject: z.string(), body: z.string() }),
  language: z.string(),
})

function buildTask(schedule, customInstructions) {
  return {
    sources: Array.isArray(schedule.sources) ? schedule.sources : [],
    profile: schedule.profile,
    userId: schedule.userId,
    timezone: schedule.timezone,
    customInstructions,
    question: schedule.question,
  }
}

async function findTicketRefs(task, conversation) {
  const { result } = await runUnattended(
    { ...task, input: buildTicketSearchTask(task.question), readOnlyOutputType: ticketRefsSchema },
    conversation
  )
  const parsed = ticketRefsSchema.safeParse(result?.finalOutput)

  return parsed.success ? parsed.data.tickets : []
}

async function draftReply(task, ticket, logger) {
  try {
    const { result } = await runUnattended({
      ...task,
      input: buildDraftTask(task.question, ticket),
      readOnlyOutputType: draftSchema,
    })
    const parsed = draftSchema.safeParse(result?.finalOutput)

    return parsed.success ? { value: parsed.data } : { error: 'Draft failed (the reply came back incomplete)' }
  } catch (err) {
    logger.error(`[legal] Could not draft the reply to ${ticket.source} ticket ${ticket.ticketId}:`, err)
    return { error: 'Draft failed (the agent could not finish it)' }
  }
}

function describeCheck(check) {
  if (check.status !== JEV_CHECK_ANSWERED) return { status: LEGAL_CASE_NOT_CHECKED, reason: check.reason, jev: null }

  const { setVersion, model, minConfidence, rows } = check

  return { status: LEGAL_CASE_CHECKED, reason: null, jev: { setVersion, model, minConfidence, rows } }
}

async function checkCase(ticket, drafted) {
  const check = await runJevCheck({
    project: JEV_LEGAL_DOCUMENT,
    state: {
      ticket: { source: ticket.source, subject: ticket.subject, customer: ticket.customer },
      customerMessage: ticket.customerMessage,
      dataFacts: drafted.dataFacts,
      draft: drafted.draft,
      language: drafted.language,
    },
  })

  return describeCheck(check)
}

function countWarnings(jev) {
  return jev ? jev.rows.filter(row => row.flagged || row.unsure).length : 0
}

async function handleTicket(context, ticket) {
  const { task, schedule, conversationId, logger } = context
  const drafted = await draftReply(task, ticket, logger)
  const outcome = drafted.error
    ? { status: LEGAL_CASE_NOT_CHECKED, reason: drafted.error, jev: null }
    : await checkCase(ticket, drafted.value)
  const legalCase = {
    source: ticket.source,
    ticketId: ticket.ticketId,
    ticketUrl: ticket.url ?? null,
    customer: ticket.customer,
    subject: ticket.subject,
    customerMessage: ticket.customerMessage,
    dataFacts: drafted.value?.dataFacts ?? null,
    draft: drafted.value?.draft ?? null,
    language: drafted.value?.language ?? null,
    ...outcome,
    warnings: countWarnings(outcome.jev),
  }

  await saveLegalCase({ ...legalCase, scheduleId: schedule.id, conversationId, messageHash: ticket.messageHash })

  return legalCase
}

function describeRun(cases, waiting) {
  const later =
    waiting > 0 ? `\n\n${waiting} more ticket${waiting === 1 ? '' : 's'} will be drafted in the next run.` : ''
  if (cases.length === 0) return `No new customer tickets to answer for this query.${later}`

  const count = `${cases.length} customer ticket${cases.length === 1 ? '' : 's'}`

  return (
    [
      `Found **${count}** to answer. For each one Soporti looked up the data and drafted a reply, and Jev checked the customer's request and the draft.`,
      "Nothing has been sent. Check each reply, edit it if needed, copy it and send it from its ticket. Jev's warnings are there to help: Legal has the last word on every case.",
    ].join('\n\n') + later
  )
}

function buildMessages(question, cases, waiting) {
  const parts = [{ type: 'text', content: describeRun(cases, waiting) }]
  if (cases.length > 0) parts.push({ type: LEGAL_RUN_PART, cases })

  return [
    { role: 'user', parts: [{ type: 'text', content: question }] },
    { role: 'assistant', parts },
  ]
}

export async function runLegalSchedule(schedule, conversationStore, { logger = console } = {}) {
  const { conversationId, session } = await conversationStore.createScheduled(schedule.userId, schedule.id)

  try {
    const task = buildTask(schedule, await loadCustomInstructions(schedule.userId))
    const refs = await findTicketRefs(task, { session, conversationId })
    const tickets = await readLegalTickets(schedule.userId, refs, { logger })
    const drafted = await findDraftedLegalCases(schedule.id, tickets)
    const fresh = tickets.filter(ticket => !isDrafted(drafted, ticket))
    const context = { task, schedule, conversationId, logger }

    const cases = []
    for (const ticket of fresh.slice(0, MAX_CASES_PER_RUN)) {
      cases.push(await handleTicket(context, ticket))
    }

    await conversationStore.saveTurn(conversationId, {
      lastResponseId: null,
      session,
      uiMessages: buildMessages(schedule.question, cases, Math.max(0, fresh.length - MAX_CASES_PER_RUN)),
    })

    return { conversationId, cases: cases.length }
  } catch (err) {
    await conversationStore.deleteWeb(conversationId, schedule.userId).catch(deleteErr => {
      logger.error('[legal] Failed to clean up a failed run:', deleteErr.message)
    })
    throw err
  }
}
