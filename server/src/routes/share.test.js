import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import shareRoute from './share.js'

function createMockStore() {
  return {
    create: vi.fn(),
    get: vi.fn(),
    refresh: vi.fn(),
  }
}

describe('share routes', () => {
  let app
  let store

  beforeEach(() => {
    store = createMockStore()
    app = express()
    app.use(express.json())
    app.use('/', shareRoute(store))
  })

  describe('POST /', () => {
    it('creates a new share', async () => {
      store.create.mockReturnValue({ id: 'abc123', messages: [] })

      const res = await request(app)
        .post('/')
        .send({ messages: [{ role: 'user', content: 'Hello' }] })

      expect(res.status).toBe(200)
      expect(res.body.shareId).toBe('abc123')
      expect(res.body.url).toBe('/share/abc123')
    })

    it('refreshes existing share', async () => {
      store.refresh.mockReturnValue({ id: 'existing', messages: [] })

      const res = await request(app)
        .post('/')
        .send({
          shareId: 'existing',
          messages: [{ role: 'user', content: 'Updated' }],
        })

      expect(res.status).toBe(200)
      expect(res.body.shareId).toBe('existing')
      expect(store.refresh).toHaveBeenCalledWith('existing', expect.any(Array))
    })

    it('creates new share when refresh fails', async () => {
      store.refresh.mockReturnValue(null)
      store.create.mockReturnValue({ id: 'new123', messages: [] })

      const res = await request(app)
        .post('/')
        .send({
          shareId: 'expired',
          messages: [{ role: 'user', content: 'Hello' }],
        })

      expect(res.status).toBe(200)
      expect(res.body.shareId).toBe('new123')
    })

    it('returns 400 for empty messages', async () => {
      const res = await request(app).post('/').send({ messages: [] })
      expect(res.status).toBe(400)
    })

    it('returns 400 for missing messages', async () => {
      const res = await request(app).post('/').send({})
      expect(res.status).toBe(400)
    })
  })

  describe('GET /:id', () => {
    it('returns shared conversation', async () => {
      store.get.mockReturnValue({
        id: 'abc',
        title: 'Test',
        messages: [{ role: 'user', content: 'Hi' }],
        createdAt: '2024-01-01T00:00:00Z',
        expiresAt: '2024-01-02T00:00:00Z',
      })

      const res = await request(app).get('/abc')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('abc')
      expect(res.body.title).toBe('Test')
      expect(res.body.messages).toHaveLength(1)
    })

    it('returns 404 for expired/missing share', async () => {
      store.get.mockReturnValue(null)

      const res = await request(app).get('/nonexistent')
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('not found')
    })
  })
})
