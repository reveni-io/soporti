import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/shares.js', () => ({
  createOrRefreshShare: vi.fn(),
  getShare: vi.fn(),
}))

vi.mock('../db/artifacts.js', () => ({
  getSharedArtifact: vi.fn(),
}))

vi.mock('../db/video-shares.js', () => ({ getSharedVideo: vi.fn() }))

const { createOrRefreshShare, getShare } = await import('../db/shares.js')
const { getSharedArtifact } = await import('../db/artifacts.js')
const { getSharedVideo } = await import('../db/video-shares.js')
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

describe('GET /artifact/:shareId', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/', shareRouter)
  })

  it('returns the frozen artifact with no authentication', async () => {
    getSharedArtifact.mockResolvedValue({ title: 'Refund dashboard', version: 2, html: '<h1>v2</h1>' })

    const res = await request(app).get(`/artifact/${SHARE_ID}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ title: 'Refund dashboard', version: 2, html: '<h1>v2</h1>' })
    expect(getSharedArtifact).toHaveBeenCalledWith(SHARE_ID)
  })

  it('rejects a malformed share id without touching the database', async () => {
    const res = await request(app).get('/artifact/not-a-share-id')

    expect(res.status).toBe(400)
    expect(getSharedArtifact).not.toHaveBeenCalled()
  })

  it('returns 404 for an expired or unknown share', async () => {
    getSharedArtifact.mockResolvedValue(null)

    const res = await request(app).get(`/artifact/${SHARE_ID}`)

    expect(res.status).toBe(404)
  })

  it('reads the artifact share, never a conversation share', async () => {
    getSharedArtifact.mockResolvedValue({ title: 'Refund dashboard', version: 1, html: '<h1>v1</h1>' })

    await request(app).get(`/artifact/${SHARE_ID}`)

    expect(getSharedArtifact).toHaveBeenCalledTimes(1)
    expect(getShare).not.toHaveBeenCalled()
  })

  it('returns 500 when the DB fails', async () => {
    getSharedArtifact.mockRejectedValue(new Error('boom'))

    const res = await request(app).get(`/artifact/${SHARE_ID}`)

    expect(res.status).toBe(500)
    expect(res.body.error).not.toContain('boom')
  })
})

describe('GET /videos/:shareId', () => {
  const MP4 = Buffer.from('0123456789')
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use('/', shareRouter)
  })

  it('serves the shared MP4 inline to anyone with the link', async () => {
    getSharedVideo.mockResolvedValue({ title: 'Refunds', version: 2, mp4: MP4 })

    const res = await request(app).get(`/videos/${SHARE_ID}`).buffer(true)

    expect(res.status).toBe(200)
    expect(getSharedVideo).toHaveBeenCalledWith(SHARE_ID)
    expect(res.headers['content-type']).toBe('video/mp4')
    expect(res.headers['content-disposition']).toBe('inline')
    expect(Buffer.from(res.body).equals(MP4)).toBe(true)
  })

  it('serves a byte range so browsers can seek', async () => {
    getSharedVideo.mockResolvedValue({ title: 'Refunds', version: 2, mp4: MP4 })

    const res = await request(app).get(`/videos/${SHARE_ID}`).set('Range', 'bytes=2-4').buffer(true)

    expect(res.status).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 2-4/10')
    expect(Buffer.from(res.body).toString()).toBe('234')
  })

  it('returns 400 for a malformed link, 404 for an expired one and 500 when the DB fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    getSharedVideo.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('boom'))

    expect((await request(app).get('/videos/nope')).status).toBe(400)
    expect((await request(app).get(`/videos/${SHARE_ID}`)).status).toBe(404)
    expect((await request(app).get(`/videos/${SHARE_ID}`)).status).toBe(500)
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
