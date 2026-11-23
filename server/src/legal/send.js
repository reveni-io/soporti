import { LEGAL_CASE_CHECKED } from '../constants.js'
import { listLegalReplies, saveLegalReply } from '../db/legal-replies.js'
import { findSendBlocker, sendLegalReply } from './replies.js'

const MAX_REPLY_CHARS = 10_000
const CONFIRMATION_MESSAGES = 2

export const WARNINGS_NOT_READ = 'Confirm that you read the warnings of this case before sending.'
export const ALREADY_SENT = 'This reply was already sent to the ticket.'
export const NOT_SHOWN_YET =
  'The user has not seen this case yet. Show it to them and send it only when they ask for it in a new message.'
export const SENT_NOT_RECORDED =
  'The reply was sent, but Soporti could not record it. Check the ticket before sending it again.'

function parseReplyText(value) {
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

function isFromThisTurn(legalCase, turnStartedAt) {
  return new Date(legalCase.createdAt) >= turnStartedAt
}

function hasConfirmationExpired(legalCase, completedTurns) {
  const shownTurn = legalCase.warningsShownTurn

  return shownTurn === null || completedTurns - shownTurn > CONFIRMATION_MESSAGES
}

export async function sendCaseReply({ legalCase, user, warningsRead, turnStartedAt, completedTurns }) {
  const draft = parseReplyText(legalCase.draft?.body)
  if (draft.error) return { blocker: draft.error }
  if (isFromThisTurn(legalCase, turnStartedAt)) return { blocker: NOT_SHOWN_YET }

  const text = draft.value
  const blocker = await findReplyBlocker(legalCase, { userId: user.id, text })
  if (blocker) return { blocker }
  if (needsCare(legalCase)) {
    if (hasConfirmationExpired(legalCase, completedTurns)) return { expired: true }
    if (!warningsRead) return { unconfirmed: WARNINGS_NOT_READ }
  }

  const externalId = await sendLegalReply(legalCase, { userId: user.id, text })
  const reply = await recordReply({ legalCase, user, text, externalId })
  if (reply) return { reply: { id: reply.id, sentBy: reply.sentBy, text: reply.text, sentAt: reply.sentAt } }

  return { reply: { id: null, sentBy: user.email, text, sentAt: new Date().toISOString() }, warning: SENT_NOT_RECORDED }
}
