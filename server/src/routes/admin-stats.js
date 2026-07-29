import { Router } from 'express'
import { getConversationStats, getMessageStats } from '../db/stats.js'
import { countDistinctSubjects, getRunTotals, getRunsByChannel, getTopTools } from '../db/agent-runs.js'
import {
  AGENT_CHANNEL_AUTO_DIAGNOSE,
  AGENT_CHANNEL_PR_REVIEW,
  STATS_RANGE_ALL,
  STATS_RANGE_DAYS,
} from '../constants.js'

const DAY_MS = 24 * 60 * 60 * 1000

const SOURCES = {
  conversations: since => getConversationStats(since),
  messages: since => getMessageStats(since),
  runs: since => getRunTotals(since),
  byChannel: since => getRunsByChannel(since),
  tools: since => getTopTools(since),
  reviewedPullRequests: since => countDistinctSubjects(AGENT_CHANNEL_PR_REVIEW, since),
  diagnosedTickets: since => countDistinctSubjects(AGENT_CHANNEL_AUTO_DIAGNOSE, since),
}

const router = Router()

function parseDays(raw) {
  if (raw === undefined || raw === '' || raw === STATS_RANGE_ALL) return { value: null }

  const days = Number(raw)
  if (!STATS_RANGE_DAYS.includes(days)) {
    return { error: `days must be one of ${STATS_RANGE_DAYS.join(', ')} or "${STATS_RANGE_ALL}".` }
  }

  return { value: days }
}

async function loadSources(since) {
  const names = Object.keys(SOURCES)
  const results = await Promise.allSettled(names.map(name => SOURCES[name](since)))

  const loaded = {}
  results.forEach((result, index) => {
    const name = names[index]
    if (result.status === 'rejected') {
      console.error(`Failed to load the ${name} stats:`, result.reason?.message)
    }
    loaded[name] = result.status === 'fulfilled' ? result.value : null
  })

  return loaded
}

function buildStats(days, loaded) {
  const { conversations, messages } = loaded

  return {
    days,
    conversations: conversations?.conversations ?? null,
    activeUsers: conversations?.activeUsers ?? null,
    conversationsBySource: conversations?.bySource ?? null,
    messages: messages?.messages ?? null,
    userMessages: messages?.userMessages ?? null,
    reviewedPullRequests: loaded.reviewedPullRequests,
    diagnosedTickets: loaded.diagnosedTickets,
    runs: loaded.runs,
    byChannel: loaded.byChannel,
    tools: loaded.tools,
  }
}

router.get('/', async (req, res) => {
  const { error, value: days } = parseDays(req.query.days)
  if (error) return res.status(400).json({ error })

  try {
    const since = days === null ? null : new Date(Date.now() - days * DAY_MS)
    const loaded = await loadSources(since)
    if (Object.values(loaded).every(value => value === null)) {
      return res.status(500).json({ error: 'Failed to load the stats.' })
    }

    res.json({ stats: buildStats(days, loaded) })
  } catch (err) {
    console.error('Failed to load the admin stats:', err)
    res.status(500).json({ error: 'Failed to load the stats.' })
  }
})

export default router
