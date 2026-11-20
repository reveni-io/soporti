import { Router } from 'express'
import { isGuardSendingEnabled } from '../jev/settings.js'
import { LEGAL_CASE_CHECKED } from '../constants.js'
import { findOwnedLegalCases, getOwnedLegalCase } from '../db/legal-cases.js'
import { listLegalReplies, saveLegalReply } from '../db/legal-replies.js'
import {
  GUARD_SEND_OFF,
  LegalReplyError,
  findSendBlocker,
  readLegalConversation,
  sendLegalReply,
} from '../legal/replies.js'

const router = Router()

router.use((req, res, next) => {
  if (req.apiKey) return res.status(403).json({ error: 'API keys cannot send or read Legal replies.' })
  next()
})

const ID_RE = /^\d{1,9}$/
const MAX_IDS = 50
const MAX_REPLY_CHARS = 10_000
const NOT_FOUND = { error: 'Case not found.' }
const WARNINGS_NOT_READ = 'Confirm that you read the warnings of this case before sending.'
const SENT_NOT_RECORDED =
  'The reply was sent, but Soporti could not record it. Check the ticket before sending it again.'

function parseIds(value) {
  const ids = String(value ?? '')
    .split(',')
    .filter(Boolean)
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every(id => ID_RE.test(id))) {
    return { error: `"ids" must be from 1 to ${MAX_IDS} case ids separated by commas.` }
  }

  return { value: [...new Set(ids.map(Number))] }
}

function parseReply(body) {
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) return { error: 'The reply is empty.' }
  if (text.length > MAX_REPLY_CHARS) return { error: `The reply is too long (max ${MAX_REPLY_CHARS} characters).` }

  return { value: { text, warningsRead: body.warningsRead === true } }
}

function needsCare(legalCase) {
  return legalCase.status !== LEGAL_CASE_CHECKED || legalCase.warnings > 0
}

function toReply({ id, sentBy, text, sentAt }) {
  return { id, sentBy, text, sentAt }
}

async function describeSending(legalCases, userId) {
  if (!(await isGuardSendingEnabled())) return new Map(legalCases.map(({ id }) => [id, GUARD_SEND_OFF]))

  const sources = [...new Set(legalCases.map(({ source }) => source))]
  const blockers = await Promise.all(sources.map(source => findSendBlocker(source, userId)))
  const bySource = new Map(sources.map((source, index) => [source, blockers[index]]))

  return new Map(legalCases.map(({ id, source }) => [id, bySource.get(source)]))
}

async function recordReply({ legalCase, user, text, externalId }) {
  try {
    return await saveLegalReply({ caseId: legalCase.id, userId: user.id, sentBy: user.email, text, externalId })
  } catch (err) {
    console.error('Failed to record a sent Legal reply:', err)
    return null
  }
}

async function findReplyBlocker(legalCase, userId) {
  if (!(await isGuardSendingEnabled())) return GUARD_SEND_OFF

  return findSendBlocker(legalCase.source, userId)
}

router.get('/cases', async (req, res) => {
  const { error, value: ids } = parseIds(req.query.ids)
  if (error) return res.status(400).json({ error })

  try {
    const legalCases = await findOwnedLegalCases(ids, req.user.id)
    const [replies, blockers] = await Promise.all([
      listLegalReplies(legalCases.map(({ id }) => id)),
      describeSending(legalCases, req.user.id),
    ])

    res.json({
      cases: legalCases.map(legalCase => ({
        id: legalCase.id,
        replies: replies.filter(reply => reply.caseId === legalCase.id).map(toReply),
        send: { allowed: !blockers.get(legalCase.id), reason: blockers.get(legalCase.id) ?? null },
      })),
    })
  } catch (err) {
    console.error('Failed to load the Legal cases:', err)
    res.status(500).json({ error: 'Failed to load the cases.' })
  }
})

router.post('/cases/:id/replies', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(404).json(NOT_FOUND)
  const { error, value } = parseReply(req.body)
  if (error) return res.status(400).json({ error })

  try {
    const legalCase = await getOwnedLegalCase(Number(req.params.id), req.user.id)
    if (!legalCase) return res.status(404).json(NOT_FOUND)

    const blocker = await findReplyBlocker(legalCase, req.user.id)
    if (blocker) return res.status(403).json({ error: blocker })
    if (needsCare(legalCase) && !value.warningsRead) return res.status(422).json({ error: WARNINGS_NOT_READ })

    const externalId = await sendLegalReply(legalCase, { userId: req.user.id, text: value.text })
    const reply = await recordReply({ legalCase, user: req.user, text: value.text, externalId })
    if (!reply) {
      const unrecorded = { id: null, sentBy: req.user.email, text: value.text, sentAt: new Date().toISOString() }
      return res.status(201).json({ reply: unrecorded, warning: SENT_NOT_RECORDED })
    }

    res.status(201).json({ reply: toReply(reply) })
  } catch (err) {
    if (err instanceof LegalReplyError) return res.status(502).json({ error: err.message })

    console.error('Failed to send the Legal reply:', err)
    res.status(500).json({ error: 'Failed to send the reply.' })
  }
})

router.get('/cases/:id/conversation', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(404).json(NOT_FOUND)

  try {
    const legalCase = await getOwnedLegalCase(Number(req.params.id), req.user.id)
    if (!legalCase) return res.status(404).json(NOT_FOUND)

    const { messages, notice } = await readLegalConversation(legalCase, req.user.id)
    res.json({ messages, notice })
  } catch (err) {
    if (err instanceof LegalReplyError) return res.status(502).json({ error: err.message })

    console.error('Failed to read the Legal conversation:', err)
    res.status(500).json({ error: 'Failed to read the conversation.' })
  }
})

export default router
