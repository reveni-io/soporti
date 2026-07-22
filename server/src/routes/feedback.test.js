import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../knowledge/feedback.js', () => ({
  processFeedback: vi.fn(),
}))

import { processFeedback } from '../knowledge/feedback.js'
import feedbackRouter from './feedback.js'

const app = express()
app.use(express.json())
app.use('/', feedbackRouter)

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when feedbackId is missing', async () => {
    const res = await request(app).post('/').send({ useful: true })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/feedbackId/)
  })

  it('returns 400 when useful is missing', async () => {
    const res = await request(app).post('/').send({ feedbackId: 'abc' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/useful/)
  })

  it('returns 400 when useful is not boolean', async () => {
    const res = await request(app).post('/').send({ feedbackId: 'abc', useful: 'yes' })
    expect(res.status).toBe(400)
  })

  it('processes positive feedback', async () => {
    processFeedback.mockResolvedValue({ saved: true, fileId: 'file_1' })

    const res = await request(app).post('/').send({ feedbackId: 'fb-123', useful: true })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ saved: true, fileId: 'file_1' })
    expect(processFeedback).toHaveBeenCalledWith('fb-123', true)
  })

  it('processes negative feedback', async () => {
    processFeedback.mockResolvedValue({ saved: false, reason: 'negative' })

    const res = await request(app).post('/').send({ feedbackId: 'fb-456', useful: false })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ saved: false, reason: 'negative' })
    expect(processFeedback).toHaveBeenCalledWith('fb-456', false)
  })

  it('returns 500 when processFeedback throws', async () => {
    processFeedback.mockRejectedValue(new Error('DB error'))

    const res = await request(app).post('/').send({ feedbackId: 'fb-err', useful: true })

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/Failed/)
  })
})
