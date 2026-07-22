import { randomUUID } from 'node:crypto'
import { saveSolvedCase } from './client.js'

const pendingFeedback = new Map()

const FEEDBACK_TTL_MS = 60 * 60 * 1000
const MAX_PENDING = 5000

export function storePendingFeedback(question, answer) {
  if (pendingFeedback.size >= MAX_PENDING) {
    const oldestKey = pendingFeedback.keys().next().value
    pendingFeedback.delete(oldestKey)
  }

  const feedbackId = randomUUID()
  pendingFeedback.set(feedbackId, { question, answer, createdAt: Date.now() })
  return feedbackId
}

export async function processFeedback(feedbackId, useful) {
  const entry = pendingFeedback.get(feedbackId)
  if (!entry) return { saved: false, reason: 'not_found' }

  pendingFeedback.delete(feedbackId)

  if (!useful) return { saved: false, reason: 'negative' }

  const fileId = await saveSolvedCase(entry.question, entry.answer)
  return { saved: true, fileId }
}

export function cleanupPendingFeedback() {
  const cutoff = Date.now() - FEEDBACK_TTL_MS
  let cleaned = 0
  for (const [id, entry] of pendingFeedback) {
    if (entry.createdAt < cutoff) {
      pendingFeedback.delete(id)
      cleaned++
    }
  }
  return cleaned
}

setInterval(() => cleanupPendingFeedback(), 15 * 60 * 1000).unref()
