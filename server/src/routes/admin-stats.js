import { Router } from 'express'
import { getConversationStats, getMessageStats } from '../db/stats.js'
import { countDistinctSubjects, getRunTotals, getRunsByChannel, getTopTools } from '../db/agent-runs.js'
import {
  AGENT_CHANNEL_AUTO_DIAGNOSE,
  AGENT_CHANNEL_PR_REVIEW,
  STATS_RANGE_ALL,
  STATS_RANGE_HOURS,
} from '../constants.js'

const HOUR_MS = 60 * 60 * 1000

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

function parseHours(raw) {
  if (raw === undefined || raw === '' || raw === STATS_RANGE_ALL) return { value: null }

  const hours = Number(raw)
  if (!STATS_RANGE_HOURS.includes(hours)) {
    return { error: `hours must be one of ${STATS_RANGE_HOURS.join(', ')} or "${STATS_RANGE_ALL}".` }
  }

  return { value: hours }
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

function buildStats(hours, loaded) {
  const { conversations, messages } = loaded

  return {
    hours,
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
  const { error, value: hours } = parseHours(req.query.hours)
  if (error) return res.status(400).json({ error })

  try {
    const since = hours === null ? null : new Date(Date.now() - hours * HOUR_MS)
    const loaded = await loadSources(since)
    if (Object.values(loaded).every(value => value === null)) {
      return res.status(500).json({ error: 'Failed to load the stats.' })
    }

    res.json({ stats: buildStats(hours, loaded) })
  } catch (err) {
    console.error('Failed to load the admin stats:', err)
    res.status(500).json({ error: 'Failed to load the stats.' })
  }
})

export default router
