import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const getConversationStats = vi.fn()
const getMessageStats = vi.fn()
const getRunTotals = vi.fn()
const getRunsByChannel = vi.fn()
const getTopTools = vi.fn()
const countChannelRuns = vi.fn()
const countDistinctSubjects = vi.fn()

vi.mock('../db/stats.js', () => ({ getConversationStats, getMessageStats }))
vi.mock('../db/agent-runs.js', () => ({
  getRunTotals,
  getRunsByChannel,
  getTopTools,
  countChannelRuns,
  countDistinctSubjects,
}))

const { default: adminStatsRouter } = await import('./admin-stats.js')

const app = express()
app.use('/api/admin/stats', adminStatsRouter)

const TOTALS = {
  runs: 12,
  failedRuns: 1,
  requests: 30,
  inputTokens: 100_000,
  outputTokens: 5000,
  cachedInputTokens: 80_000,
  cacheWriteTokens: 1000,
  p50DurationMs: 3000,
  p95DurationMs: 9000,
}

beforeEach(() => {
  vi.clearAllMocks()
  getConversationStats.mockResolvedValue({
    conversations: 40,
    activeUsers: 5,
    bySource: [{ source: 'web', conversations: 40 }],
  })
  getMessageStats.mockResolvedValue({ messages: 120, userMessages: 60 })
  getRunTotals.mockResolvedValue(TOTALS)
  getRunsByChannel.mockResolvedValue([
    { channel: 'web', runs: 8, failedRuns: 1 },
    { channel: 'auto_diagnose', runs: 4, failedRuns: 1 },
  ])
  getTopTools.mockResolvedValue([{ tool: 'search_code', calls: 20 }])
  countChannelRuns.mockResolvedValue(7)
  countDistinctSubjects.mockImplementation(async channel => (channel === 'pr_review' ? 3 : 5))
})

describe('GET /api/admin/stats', () => {
  it('returns the full stats payload for all time', async () => {
    const res = await request(app).get('/api/admin/stats')

    expect(res.status).toBe(200)
    expect(res.body.stats).toEqual({
      hours: null,
      conversations: 40,
      activeUsers: 5,
      conversationsBySource: [{ source: 'web', conversations: 40 }],
      messages: 120,
      userMessages: 60,
      reviewedPullRequests: 3,
      diagnosedTickets: 5,
      mcpQueries: 7,
      runs: TOTALS,
      byChannel: [
        { channel: 'web', runs: 8, failedRuns: 1 },
        { channel: 'auto_diagnose', runs: 4, failedRuns: 1 },
      ],
      tools: [{ tool: 'search_code', calls: 20 }],
    })
    expect(getConversationStats).toHaveBeenCalledWith(null)
    expect(getRunTotals).toHaveBeenCalledWith(null)
  })

  it('turns the range into a start date every source is filtered by', async () => {
    const res = await request(app).get('/api/admin/stats?hours=168')

    expect(res.status).toBe(200)
    expect(res.body.stats.hours).toBe(168)

    const since = getConversationStats.mock.calls[0][0]
    expect(since).toBeInstanceOf(Date)
    const elapsedHours = (Date.now() - since.getTime()) / (60 * 60 * 1000)
    expect(elapsedHours).toBeCloseTo(168, 1)
    expect(getMessageStats).toHaveBeenCalledWith(since)
    expect(getRunsByChannel).toHaveBeenCalledWith(since)
    expect(countDistinctSubjects).toHaveBeenCalledWith('pr_review', since)
    expect(countChannelRuns).toHaveBeenCalledWith('mcp', since)
  })

  it('filters by the hour when the range is sub-daily', async () => {
    const res = await request(app).get('/api/admin/stats?hours=1')

    expect(res.status).toBe(200)
    expect(res.body.stats.hours).toBe(1)

    const since = getConversationStats.mock.calls[0][0]
    const elapsedHours = (Date.now() - since.getTime()) / (60 * 60 * 1000)
    expect(elapsedHours).toBeCloseTo(1, 1)
  })

  it('accepts every supported range and treats an empty one as all time', async () => {
    for (const hours of [3, 24, 720, 2160]) {
      const res = await request(app).get(`/api/admin/stats?hours=${hours}`)

      expect(res.status).toBe(200)
      expect(res.body.stats.hours).toBe(hours)
    }

    const res = await request(app).get('/api/admin/stats?hours=')

    expect(res.status).toBe(200)
    expect(res.body.stats.hours).toBe(null)
    expect(getRunTotals).toHaveBeenLastCalledWith(null)
  })

  it('counts each diagnosed ticket once even when it was diagnosed twice', async () => {
    const res = await request(app).get('/api/admin/stats')

    expect(res.body.stats.diagnosedTickets).toBe(5)
    expect(countDistinctSubjects).toHaveBeenCalledWith('auto_diagnose', null)
  })

  it('counts the MCP questions on their own channel instead of as web ones', async () => {
    countChannelRuns.mockResolvedValue(11)

    const res = await request(app).get('/api/admin/stats')

    expect(res.body.stats.mcpQueries).toBe(11)
    expect(countChannelRuns.mock.calls).toEqual([['mcp', null]])
  })

  it('re-queries every request so a range never serves stale numbers', async () => {
    await request(app).get('/api/admin/stats?hours=168')
    getRunTotals.mockResolvedValue({ ...TOTALS, runs: 13 })

    const res = await request(app).get('/api/admin/stats?hours=168')

    expect(res.status).toBe(200)
    expect(res.body.stats.runs.runs).toBe(13)
    expect(getRunTotals).toHaveBeenCalledTimes(2)
  })

  it('rejects an unsupported range with a 400', async () => {
    const res = await request(app).get('/api/admin/stats?hours=8760')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/hours must be one of/)
    expect(getRunTotals).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric range with a 400', async () => {
    const res = await request(app).get('/api/admin/stats?hours=abc')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/hours must be one of/)
    expect(getRunTotals).not.toHaveBeenCalled()
  })

  it('still serves the queries that worked when one of them fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    getTopTools.mockRejectedValue(new Error('cannot extract elements from a scalar'))

    const res = await request(app).get('/api/admin/stats')

    expect(res.status).toBe(200)
    expect(res.body.stats.tools).toBe(null)
    expect(res.body.stats.conversations).toBe(40)
    expect(res.body.stats.runs).toEqual(TOTALS)
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load the tools stats:',
      'cannot extract elements from a scalar'
    )
    consoleError.mockRestore()
  })

  it('returns a generic 500 when every query fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = () => Promise.reject(new Error('db down'))
    getConversationStats.mockImplementation(down)
    getMessageStats.mockImplementation(down)
    getRunTotals.mockImplementation(down)
    getRunsByChannel.mockImplementation(down)
    getTopTools.mockImplementation(down)
    countChannelRuns.mockImplementation(down)
    countDistinctSubjects.mockImplementation(down)

    const res = await request(app).get('/api/admin/stats')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the stats.' })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('recovers on the next request once the database is back', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = () => Promise.reject(new Error('db down'))
    getConversationStats.mockImplementation(down)
    getMessageStats.mockImplementation(down)
    getRunTotals.mockImplementation(down)
    getRunsByChannel.mockImplementation(down)
    getTopTools.mockImplementation(down)
    countChannelRuns.mockImplementation(down)
    countDistinctSubjects.mockImplementation(down)

    expect((await request(app).get('/api/admin/stats')).status).toBe(500)
    getConversationStats.mockResolvedValue({ conversations: 1, activeUsers: 1, bySource: [] })

    const res = await request(app).get('/api/admin/stats')

    expect(res.status).toBe(200)
    expect(res.body.stats.conversations).toBe(1)
    consoleError.mockRestore()
  })
})
