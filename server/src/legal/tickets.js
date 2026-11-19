import { createHash } from 'node:crypto'
import { getConversation, getRecord } from '../hubspot/client.js'
import { hasAreaAccess } from '../hubspot/permissions.js'
import { resolveHubspotAccess } from '../hubspot/settings.js'
import { getTicket } from '../zendesk/client.js'

export const LEGAL_SOURCES = ['zendesk', 'hubspot']

const END_USER_ROLE = 'end-user'
const CUSTOMER_DIRECTION = 'INCOMING'
const READ_LEVEL = 'read'
const HUBSPOT_TICKET_PROPERTIES = ['subject', 'content', 'hs_conversations_originating_thread_id']

function hashMessage(message) {
  return createHash('sha256').update(message).digest('hex')
}

async function readZendeskTicket(userId, ticketId) {
  const ticket = await getTicket(userId, ticketId)
  const message = ticket.comments.filter(comment => comment.public && comment.authorRole === END_USER_ROLE).at(-1)
  if (!message?.body?.trim()) return null

  return {
    ticketId: String(ticket.id),
    url: ticket.url,
    subject: ticket.subject,
    customer: ticket.requester?.email ?? ticket.requester?.name ?? '',
    customerMessage: message.body.trim(),
  }
}

async function readThreadMessage(threadId, permissions) {
  if (!threadId || !hasAreaAccess(permissions, 'conversations', READ_LEVEL)) return null

  const { messages } = await getConversation(threadId)
  const message = messages.filter(item => item.direction === CUSTOMER_DIRECTION).at(-1)
  if (!message) return null

  const [sender] = message.from

  return { text: message.text, customer: sender?.address ?? sender?.name ?? '' }
}

async function readHubspotTicket(userId, ticketId) {
  const access = await resolveHubspotAccess({ userId, unattended: true })
  if (!access || !hasAreaAccess(access.permissions, 'tickets', READ_LEVEL)) return null

  const record = await getRecord('tickets', ticketId, {
    properties: HUBSPOT_TICKET_PROPERTIES,
    permissions: access.permissions,
  })
  const properties = record.properties ?? {}
  const fromThread = await readThreadMessage(properties.hs_conversations_originating_thread_id, access.permissions)
  const customerMessage = (fromThread?.text ?? properties.content ?? '').trim()
  if (!customerMessage) return null

  return {
    ticketId: String(record.id),
    url: record.url,
    subject: properties.subject ?? '',
    customer: fromThread?.customer ?? '',
    customerMessage,
  }
}

const READERS = { zendesk: readZendeskTicket, hubspot: readHubspotTicket }

function uniqueRefs(refs) {
  const seen = new Map(refs.map(ref => [`${ref.source}:${ref.ticketId}`, ref]))

  return [...seen.values()]
}

async function readTicket(userId, ref, logger) {
  try {
    const ticket = await READERS[ref.source](userId, ref.ticketId)
    if (!ticket) return null

    return { source: ref.source, ...ticket, messageHash: hashMessage(ticket.customerMessage) }
  } catch (err) {
    logger.warn(`[legal] Skipping ${ref.source} ticket ${ref.ticketId}: ${err.message}`)
    return null
  }
}

export async function readLegalTickets(userId, refs, { logger = console } = {}) {
  const tickets = []

  for (const ref of uniqueRefs(refs)) {
    const ticket = await readTicket(userId, ref, logger)
    if (ticket) tickets.push(ticket)
  }

  return tickets
}
