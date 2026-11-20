import { getJevDocument } from '../db/jev-documents.js'
import { JEV_LEGAL_DOCUMENT } from '../constants.js'
import { HUBSPOT_REQUEST_FAILED, getConversation, getRecord, replyToConversation } from '../hubspot/client.js'
import { hasAreaAccess } from '../hubspot/permissions.js'
import { resolveHubspotAccess } from '../hubspot/settings.js'
import { getTicket, isConfigured as isZendeskConnected, postPublicReply } from '../zendesk/client.js'

const THREAD_PROPERTY = 'hs_conversations_originating_thread_id'
const END_USER_ROLE = 'end-user'
const CUSTOMER_DIRECTION = 'INCOMING'
const READ_LEVEL = 'read'
const PUBLIC_MESSAGE_TYPE = 'MESSAGE'
const MAX_CONVERSATION_PAGES = 10

export const LEGAL_SEND_OFF = 'Sending from Soporti is off. An admin can turn it on in the Legal section of the admin.'
const ZENDESK_NOT_CONNECTED = 'Connect your Zendesk account in Settings to send replies and read tickets from Soporti.'
const HUBSPOT_CANNOT_REPLY =
  'Your HubSpot user cannot reply from Soporti: replies in HubSpot conversations must be allowed in the HubSpot section of the admin.'
const HUBSPOT_CANNOT_READ = 'Soporti cannot read HubSpot conversations: an admin can allow it in the HubSpot section.'
const HUBSPOT_NO_THREAD = 'This HubSpot ticket has no conversation to reply to. Send the reply from HubSpot.'
const CONVERSATION_CAPPED =
  'This ticket is long: only its first messages are shown here. Open the ticket to read the newest ones.'
const SOURCE_LABELS = new Map([
  ['zendesk', 'Zendesk'],
  ['hubspot', 'HubSpot'],
])

function describeSendFailure(source) {
  return `${SOURCE_LABELS.get(source)} did not take the reply, so nothing was sent. Try again, or send it from the ticket.`
}

function describeReadFailure(source) {
  return `Could not read the ${SOURCE_LABELS.get(source)} ticket. Try again in a moment.`
}

export class LegalReplyError extends Error {}

function asReplyError(err, fallback) {
  if (err instanceof LegalReplyError) return err
  if (err.code === HUBSPOT_REQUEST_FAILED) return new LegalReplyError(err.message, { cause: err })

  return new LegalReplyError(fallback, { cause: err })
}

export async function isLegalSendAllowed() {
  const document = await getJevDocument(JEV_LEGAL_DOCUMENT)

  return document?.data?.allowSend === true
}

function hubspotAccess(userId) {
  return resolveHubspotAccess({ userId, unattended: false })
}

async function findZendeskBlocker(userId) {
  return (await isZendeskConnected(userId)) ? null : ZENDESK_NOT_CONNECTED
}

async function findHubspotBlocker(userId) {
  const access = await hubspotAccess(userId)

  return access?.canReply ? null : HUBSPOT_CANNOT_REPLY
}

const SEND_BLOCKERS = new Map([
  ['zendesk', findZendeskBlocker],
  ['hubspot', findHubspotBlocker],
])

export function findSendBlocker(source, userId) {
  return SEND_BLOCKERS.get(source)(userId)
}

async function hubspotThreadId(ticketId, permissions) {
  const record = await getRecord('tickets', ticketId, { properties: [THREAD_PROPERTY], permissions })

  return record.properties?.[THREAD_PROPERTY] ?? null
}

async function sendZendeskReply({ userId, ticketId, text }) {
  const reply = await postPublicReply(userId, ticketId, text)

  return reply.commentId === null ? null : String(reply.commentId)
}

async function sendHubspotReply({ userId, ticketId, text }) {
  const access = await hubspotAccess(userId)
  const threadId = await hubspotThreadId(ticketId, access.permissions)
  if (!threadId) throw new LegalReplyError(HUBSPOT_NO_THREAD)

  const reply = await replyToConversation(threadId, text, { userId })

  return reply.messageId ?? null
}

const SENDERS = new Map([
  ['zendesk', sendZendeskReply],
  ['hubspot', sendHubspotReply],
])

export async function sendLegalReply(legalCase, { userId, text }) {
  try {
    return await SENDERS.get(legalCase.source)({ userId, ticketId: legalCase.ticketId, text })
  } catch (err) {
    throw asReplyError(err, describeSendFailure(legalCase.source))
  }
}

function fromZendeskComment(comment) {
  return {
    id: String(comment.id),
    author: comment.author ?? '',
    fromCustomer: comment.authorRole === END_USER_ROLE,
    at: comment.createdAt,
    text: comment.body,
  }
}

async function readZendeskConversation(userId, ticketId) {
  if (!(await isZendeskConnected(userId))) throw new LegalReplyError(ZENDESK_NOT_CONNECTED)

  const ticket = await getTicket(userId, ticketId)

  return {
    messages: ticket.comments.filter(comment => comment.public).map(fromZendeskComment),
    notice: ticket.notice ? CONVERSATION_CAPPED : null,
  }
}

function fromHubspotMessage(message) {
  const [sender] = message.from

  return {
    id: String(message.id),
    author: sender?.name ?? sender?.address ?? '',
    fromCustomer: message.direction === CUSTOMER_DIRECTION,
    at: message.createdAt,
    text: message.text,
  }
}

async function readHubspotConversation(userId, ticketId) {
  const access = await hubspotAccess(userId)
  if (!access || !hasAreaAccess(access.permissions, 'conversations', READ_LEVEL)) {
    throw new LegalReplyError(HUBSPOT_CANNOT_READ)
  }

  const threadId = await hubspotThreadId(ticketId, access.permissions)
  if (!threadId) return { messages: [], notice: null }

  const { messages, capped } = await readHubspotMessages(threadId)

  return {
    messages: messages.filter(message => message.type === PUBLIC_MESSAGE_TYPE).map(fromHubspotMessage),
    notice: capped ? CONVERSATION_CAPPED : null,
  }
}

async function readHubspotMessages(threadId) {
  const messages = []
  let after

  for (let page = 0; page < MAX_CONVERSATION_PAGES; page++) {
    const result = await getConversation(threadId, { after })
    messages.push(...result.messages)
    after = result.after
    if (!after) return { messages, capped: false }
  }

  return { messages, capped: true }
}

const READERS = new Map([
  ['zendesk', readZendeskConversation],
  ['hubspot', readHubspotConversation],
])

export async function readLegalConversation(legalCase, userId) {
  try {
    return await READERS.get(legalCase.source)(userId, legalCase.ticketId)
  } catch (err) {
    throw asReplyError(err, describeReadFailure(legalCase.source))
  }
}
