import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/users.js', () => ({
  getCustomInstructions: vi.fn(),
  updateCustomInstructions: vi.fn(),
}))

vi.mock('../granola/settings.js', () => ({
  isGranolaConfigured: vi.fn(),
  setGranolaApiKey: vi.fn(),
}))

const { getCustomInstructions, updateCustomInstructions } = await import('../db/users.js')
const { isGranolaConfigured, setGranolaApiKey } = await import('../granola/settings.js')
const { MAX_INSTRUCTIONS_LENGTH } = await import('../constants.js')
const { default: userRouter } = await import('./user.js')

const API_KEY = 'grn_dGVzdGtleTEyMzQ1Njc4OTA'

describe('user instructions routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 7 }
      next()
    })
    app.use('/', userRouter)
  })

  it('returns the instructions of the requesting user', async () => {
    getCustomInstructions.mockResolvedValue('Be brief.')

    const res = await request(app).get('/instructions')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ instructions: 'Be brief.' })
    expect(getCustomInstructions).toHaveBeenCalledWith(7)
  })

  it('returns an empty string when the user has none', async () => {
    getCustomInstructions.mockResolvedValue(null)

    const res = await request(app).get('/instructions')

    expect(res.body).toEqual({ instructions: '' })
  })

  it('returns 500 when the lookup fails', async () => {
    getCustomInstructions.mockRejectedValue(new Error('boom'))

    const res = await request(app).get('/instructions')

    expect(res.status).toBe(500)
  })

  it('saves the instructions', async () => {
    updateCustomInstructions.mockResolvedValue('Be brief.')

    const res = await request(app).put('/instructions').send({ instructions: 'Be brief.' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ instructions: 'Be brief.' })
    expect(updateCustomInstructions).toHaveBeenCalledWith(7, 'Be brief.')
  })

  it('clears the instructions when none are sent', async () => {
    updateCustomInstructions.mockResolvedValue('')

    const res = await request(app).put('/instructions').send({})

    expect(res.status).toBe(200)
    expect(updateCustomInstructions).toHaveBeenCalledWith(7, '')
  })

  it('rejects non-string instructions', async () => {
    const res = await request(app).put('/instructions').send({ instructions: 42 })

    expect(res.status).toBe(400)
    expect(updateCustomInstructions).not.toHaveBeenCalled()
  })

  it('rejects instructions over the limit', async () => {
    const res = await request(app)
      .put('/instructions')
      .send({ instructions: 'x'.repeat(MAX_INSTRUCTIONS_LENGTH + 1) })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(String(MAX_INSTRUCTIONS_LENGTH))
    expect(updateCustomInstructions).not.toHaveBeenCalled()
  })

  it('returns 500 when the save fails', async () => {
    updateCustomInstructions.mockRejectedValue(new Error('boom'))

    const res = await request(app).put('/instructions').send({ instructions: 'Be brief.' })

    expect(res.status).toBe(500)
  })
})

describe('user granola routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 7 }
      next()
    })
    app.use('/', userRouter)
  })

  describe('GET /granola', () => {
    it('reports the connection of the requesting user as a boolean', async () => {
      isGranolaConfigured.mockResolvedValue(true)

      const res = await request(app).get('/granola')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ connected: true })
      expect(isGranolaConfigured).toHaveBeenCalledWith(7)
    })

    it('never returns the stored key', async () => {
      isGranolaConfigured.mockResolvedValue(true)

      const res = await request(app).get('/granola')

      expect(JSON.stringify(res.body)).not.toContain('grn_')
    })

    it('returns 500 when the lookup fails', async () => {
      isGranolaConfigured.mockRejectedValue(new Error('boom'))

      const res = await request(app).get('/granola')

      expect(res.status).toBe(500)
      expect(res.body.error).not.toMatch(/boom/)
    })
  })

  describe('PUT /granola', () => {
    it('saves the key for the requesting user', async () => {
      setGranolaApiKey.mockResolvedValue(API_KEY)

      const res = await request(app).put('/granola').send({ apiKey: API_KEY })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ connected: true })
      expect(setGranolaApiKey).toHaveBeenCalledWith(7, API_KEY)
    })

    it('disconnects on an empty key', async () => {
      setGranolaApiKey.mockResolvedValue(null)

      const res = await request(app).put('/granola').send({ apiKey: '' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ connected: false })
      expect(setGranolaApiKey).toHaveBeenCalledWith(7, '')
    })

    it('rejects a non-string key', async () => {
      const res = await request(app).put('/granola').send({ apiKey: 123 })

      expect(res.status).toBe(400)
      expect(setGranolaApiKey).not.toHaveBeenCalled()
    })

    it('returns 400 with the reason when the key is malformed', async () => {
      setGranolaApiKey.mockRejectedValue(
        Object.assign(new Error('That does not look like a Granola API key. Keys start with "grn_".'), {
          code: 'INVALID_GRANOLA_API_KEY',
        })
      )

      const res = await request(app).put('/granola').send({ apiKey: 'nope' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/grn_/)
    })

    it('returns 500 on an unexpected failure', async () => {
      setGranolaApiKey.mockRejectedValue(new Error('boom'))

      const res = await request(app).put('/granola').send({ apiKey: API_KEY })

      expect(res.status).toBe(500)
      expect(res.body.error).not.toMatch(/boom/)
    })
  })
})
