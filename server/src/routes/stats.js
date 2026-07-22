import { Router } from 'express'
import { getUsageStats, USAGE_WINDOW_DAYS } from '../db/stats.js'
import { countSolvedCases } from '../knowledge/client.js'

// Usage stats shown in the chat empty state. Counting hits the app database
// and the OpenAI vector store, so responses are cached for a few minutes.
const CACHE_TTL_MS = 5 * 60 * 1000

let cache = null

export function clearStatsCache() {
  cache = null
}

const router = Router()

router.get('/', async (_req, res) => {
  if (cache && cache.expiresAt > Date.now()) {
    return res.json({ stats: cache.stats })
  }

  const [usage, solvedCases] = await Promise.allSettled([getUsageStats(), countSolvedCases()])
  if (usage.status === 'rejected') console.error('Usage stats failed:', usage.reason?.message)
  if (solvedCases.status === 'rejected') console.error('Solved cases count failed:', solvedCases.reason?.message)

  const stats = {
    windowDays: USAGE_WINDOW_DAYS,
    conversations: usage.status === 'fulfilled' ? usage.value.conversations : null,
    activeUsers: usage.status === 'fulfilled' ? usage.value.activeUsers : null,
    solvedCases: solvedCases.status === 'fulfilled' ? solvedCases.value : null,
  }

  // Don't cache a fully failed lookup, so the next request retries right away.
  const anyAvailable = [stats.conversations, stats.activeUsers, stats.solvedCases].some(v => v !== null)
  if (anyAvailable) {
    cache = { stats, expiresAt: Date.now() + CACHE_TTL_MS }
  }

  res.json({ stats })
})

export default router
