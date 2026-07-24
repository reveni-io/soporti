import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/shares.js', () => ({
  createOrRefreshShare: vi.fn(),
  getShare: vi.fn(),
}))

const { createOrRefreshShare, getShare } = await import('../db/shares.js')
const { default: shareRouter } = await import('./share.js')

const CONVERSATION_ID = 'a3bb189e-8bf9-4888-9912-ace4e6543002'
const SHARE_ID = 'f'.repeat(32)

describe('share routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 1 }
      next()
    })
    app.use('/', shareRouter)
  })

  describe('POST /', () => {
    it('creates or refreshes a share for an owned conversation', async () => {
      createOrRefreshShare.mockResolvedValue({ status: 'ok', shareId: SHARE_ID })

      const res = await request(app).post('/').send({ conversationId: CONVERSATION_ID })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ shareId: SHARE_ID, url: `/share/${SHARE_ID}` })
      expect(createOrRefreshShare).toHaveBeenCalledWith(CONVERSATION_ID, 1)
    })

    it('returns 400 for a missing conversationId', async () => {
      const res = await request(app).post('/').send({})

      expect(res.status).toBe(400)
      expect(createOrRefreshShare).not.toHaveBeenCalled()
    })

    it('returns 400 for a non-uuid conversationId', async () => {
      const res = await request(app).post('/').send({ conversationId: 'not-a-uuid' })

      expect(res.status).toBe(400)
      expect(createOrRefreshShare).not.toHaveBeenCalled()
    })

    it('returns 404 when the conversation is not owned or missing', async () => {
      createOrRefreshShare.mockResolvedValue({ status: 'not_found' })

      const res = await request(app).post('/').send({ conversationId: CONVERSATION_ID })

      expect(res.status).toBe(404)
    })

    it('returns 400 when the conversation has no messages yet', async () => {
      createOrRefreshShare.mockResolvedValue({ status: 'empty' })

      const res = await request(app).post('/').send({ conversationId: CONVERSATION_ID })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('no messages')
    })

    it('returns 500 on unexpected errors', async () => {
      createOrRefreshShare.mockRejectedValue(new Error('db down'))

      const res = await request(app).post('/').send({ conversationId: CONVERSATION_ID })

      expect(res.status).toBe(500)
    })
  })

  describe('GET /:id', () => {
    it('returns the shared conversation', async () => {
      getShare.mockResolvedValue({ messages: [{ role: 'user', content: 'Hi' }] })

      const res = await request(app).get(`/${SHARE_ID}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ messages: [{ role: 'user', content: 'Hi' }] })
      expect(getShare).toHaveBeenCalledWith(SHARE_ID)
    })

    it('returns 404 for an expired or missing share', async () => {
      getShare.mockResolvedValue(null)

      const res = await request(app).get(`/${'a'.repeat(32)}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('not found')
    })

    it('returns 500 on unexpected errors', async () => {
      getShare.mockRejectedValue(new Error('db down'))

      const res = await request(app).get(`/${SHARE_ID}`)

      expect(res.status).toBe(500)
    })
  })
})
