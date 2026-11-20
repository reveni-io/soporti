import { Router } from 'express'
import { isGuardSendingEnabled } from '../jev/settings.js'
import { findOwnedLegalCases, getOwnedLegalCase } from '../db/legal-cases.js'
import { listLegalReplies } from '../db/legal-replies.js'
import { GUARD_SEND_OFF, LegalReplyError, findSendBlocker, readLegalConversation } from '../legal/replies.js'

const router = Router()

router.use((req, res, next) => {
  if (req.apiKey) return res.status(403).json({ error: 'API keys cannot send or read Legal replies.' })
  next()
})

const ID_RE = /^\d{1,9}$/
const MAX_IDS = 50
const NOT_FOUND = { error: 'Case not found.' }

function parseIds(value) {
  const ids = String(value ?? '')
    .split(',')
    .filter(Boolean)
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every(id => ID_RE.test(id))) {
    return { error: `"ids" must be from 1 to ${MAX_IDS} case ids separated by commas.` }
  }

  return { value: [...new Set(ids.map(Number))] }
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
