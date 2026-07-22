import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import conversationsRoute from './conversations.js'

const VALID_ID = '11111111-1111-4111-8111-111111111111'

const store = {
  listWeb: vi.fn(),
  getWebMessages: vi.fn(),
  deleteWeb: vi.fn(),
}

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { id: 1 }
  next()
})
app.use('/', conversationsRoute(store))

describe('conversations routes', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('GET /', () => {
    it('returns the user conversations', async () => {
      store.listWeb.mockResolvedValue([{ id: VALID_ID, title: 'Hi', updatedAt: new Date().toISOString() }])
      const res = await request(app).get('/')
      expect(res.status).toBe(200)
      expect(res.body.conversations).toHaveLength(1)
      expect(store.listWeb).toHaveBeenCalledWith(1)
    })

    it('returns 500 when the store fails', async () => {
      store.listWeb.mockRejectedValue(new Error('boom'))
      const res = await request(app).get('/')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /:id', () => {
    it('rejects an invalid id', async () => {
      const res = await request(app).get('/not-a-uuid')
      expect(res.status).toBe(400)
      expect(store.getWebMessages).not.toHaveBeenCalled()
    })

    it('returns 404 when the conversation is not found or not owned', async () => {
      store.getWebMessages.mockResolvedValue(null)
      const res = await request(app).get(`/${VALID_ID}`)
      expect(res.status).toBe(404)
    })

    it('returns the messages', async () => {
      store.getWebMessages.mockResolvedValue([{ role: 'user', parts: [{ type: 'text', content: 'hi' }] }])
      const res = await request(app).get(`/${VALID_ID}`)
      expect(res.status).toBe(200)
      expect(res.body.messages).toHaveLength(1)
      expect(store.getWebMessages).toHaveBeenCalledWith(VALID_ID, 1)
    })
  })

  describe('DELETE /:id', () => {
    it('rejects an invalid id', async () => {
      const res = await request(app).delete('/nope')
      expect(res.status).toBe(400)
    })

    it('returns 404 when nothing was deleted', async () => {
      store.deleteWeb.mockResolvedValue(false)
      const res = await request(app).delete(`/${VALID_ID}`)
      expect(res.status).toBe(404)
    })

    it('returns ok when deleted', async () => {
      store.deleteWeb.mockResolvedValue(true)
      const res = await request(app).delete(`/${VALID_ID}`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(store.deleteWeb).toHaveBeenCalledWith(VALID_ID, 1)
    })
  })
})
