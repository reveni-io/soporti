import { LEGAL_CASE_CHECKED } from '../constants.js'
import { listLegalReplies, saveLegalReply } from '../db/legal-replies.js'
import { findSendBlocker, sendLegalReply } from './replies.js'

const MAX_REPLY_CHARS = 10_000

export const WARNINGS_NOT_READ = 'Confirm that you read the warnings of this case before sending.'
export const ALREADY_SENT = 'This reply was already sent to the ticket. Change it to send something new.'
export const SENT_NOT_RECORDED =
  'The reply was sent, but Soporti could not record it. Check the ticket before sending it again.'

export function parseReplyText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return { error: 'The reply is empty.' }
  if (text.length > MAX_REPLY_CHARS) return { error: `The reply is too long (max ${MAX_REPLY_CHARS} characters).` }

  return { value: text }
}

function needsCare(legalCase) {
  return legalCase.status !== LEGAL_CASE_CHECKED || legalCase.warnings > 0
}

async function findReplyBlocker(legalCase, { userId, text }) {
  const sent = await listLegalReplies([legalCase.id])
  if (sent.some(reply => reply.text === text)) return ALREADY_SENT

  return findSendBlocker(legalCase.source, userId)
}

async function recordReply({ legalCase, user, text, externalId }) {
  try {
    return await saveLegalReply({ caseId: legalCase.id, userId: user.id, sentBy: user.email, text, externalId })
  } catch (err) {
    console.error('Failed to record a sent Legal reply:', err)
    return null
  }
}

export async function sendCaseReply({ legalCase, user, text, warningsRead }) {
  const blocker = await findReplyBlocker(legalCase, { userId: user.id, text })
  if (blocker) return { blocker }
  if (needsCare(legalCase) && !warningsRead) return { unconfirmed: WARNINGS_NOT_READ }

  const externalId = await sendLegalReply(legalCase, { userId: user.id, text })
  const reply = await recordReply({ legalCase, user, text, externalId })
  if (reply) return { reply: { id: reply.id, sentBy: reply.sentBy, text: reply.text, sentAt: reply.sentAt } }

  return { reply: { id: null, sentBy: user.email, text, sentAt: new Date().toISOString() }, warning: SENT_NOT_RECORDED }
}
