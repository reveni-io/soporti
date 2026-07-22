import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const getUsageStats = vi.fn()
const countSolvedCases = vi.fn()

vi.mock('../db/stats.js', () => ({ getUsageStats, USAGE_WINDOW_DAYS: 7 }))
vi.mock('../knowledge/client.js', () => ({ countSolvedCases }))

const { default: statsRouter, clearStatsCache } = await import('./stats.js')

const app = express()
app.use('/api/stats', statsRouter)

beforeEach(() => {
  getUsageStats.mockReset()
  countSolvedCases.mockReset()
  clearStatsCache()
})

describe('GET /api/stats', () => {
  it('returns usage stats and the solved cases count', async () => {
    getUsageStats.mockResolvedValue({ conversations: 128, activeUsers: 9 })
    countSolvedCases.mockResolvedValue(96)

    const res = await request(app).get('/api/stats')

    expect(res.status).toBe(200)
    expect(res.body.stats).toEqual({
      windowDays: 7,
      conversations: 128,
      activeUsers: 9,
      solvedCases: 96,
    })
  })

  it('nulls out a stat when its source fails, keeping the rest', async () => {
    getUsageStats.mockResolvedValue({ conversations: 5, activeUsers: 2 })
    countSolvedCases.mockRejectedValue(new Error('vector store down'))

    const res = await request(app).get('/api/stats')

    expect(res.status).toBe(200)
    expect(res.body.stats.conversations).toBe(5)
    expect(res.body.stats.solvedCases).toBeNull()
  })

  it('caches the response between requests', async () => {
    getUsageStats.mockResolvedValue({ conversations: 1, activeUsers: 1 })
    countSolvedCases.mockResolvedValue(10)

    await request(app).get('/api/stats')
    const res = await request(app).get('/api/stats')

    expect(res.body.stats.solvedCases).toBe(10)
    expect(getUsageStats).toHaveBeenCalledTimes(1)
    expect(countSolvedCases).toHaveBeenCalledTimes(1)
  })

  it('does not cache when every source fails', async () => {
    getUsageStats.mockRejectedValue(new Error('db down'))
    countSolvedCases.mockRejectedValue(new Error('vector store down'))

    const first = await request(app).get('/api/stats')
    expect(first.body.stats).toEqual({
      windowDays: 7,
      conversations: null,
      activeUsers: null,
      solvedCases: null,
    })

    getUsageStats.mockResolvedValue({ conversations: 3, activeUsers: 1 })
    countSolvedCases.mockResolvedValue(4)
    const second = await request(app).get('/api/stats')

    expect(second.body.stats.conversations).toBe(3)
    expect(second.body.stats.solvedCases).toBe(4)
  })
})
