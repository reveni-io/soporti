import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../db/api-keys.js', () => ({
  listApiKeys: vi.fn(),
  countApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}))

const { listApiKeys, countApiKeys, createApiKey, revokeApiKey } = await import('../db/api-keys.js')
const { default: apiKeysRouter } = await import('./api-keys.js')
const { hashApiKey } = await import('../auth/api-key.js')

function buildApp(authContext = { user: { id: 1 } }) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.assign(req, authContext)
    next()
  })
  app.use('/', apiKeysRouter)
  return app
}

describe('api keys routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildApp()
  })

  describe('GET /', () => {
    it('returns the user keys without any secret material', async () => {
      listApiKeys.mockResolvedValue([{ id: 1, name: 'mcp', prefix: 'sop_abcd1234', sources: [] }])

      const res = await request(app).get('/')

      expect(res.status).toBe(200)
      expect(res.body.apiKeys).toEqual([{ id: 1, name: 'mcp', prefix: 'sop_abcd1234', sources: [] }])
      expect(JSON.stringify(res.body)).not.toContain('keyHash')
      expect(listApiKeys).toHaveBeenCalledWith(1)
    })

    it('returns 500 when the DB fails', async () => {
      listApiKeys.mockRejectedValue(new Error('boom'))
      const res = await request(app).get('/')
      expect(res.status).toBe(500)
    })
  })

  describe('POST /', () => {
    it('creates a key and returns the plaintext exactly once', async () => {
      countApiKeys.mockResolvedValue(0)
      createApiKey.mockImplementation(async (_userId, input) => ({ id: 1, name: input.name, prefix: input.prefix }))

      const res = await request(app)
        .post('/')
        .send({ name: 'mcp', sources: ['integration:notion'] })

      expect(res.status).toBe(201)
      expect(res.body.key).toMatch(/^sop_/)
      expect(res.body.apiKey.prefix).toBe(res.body.key.slice(0, 12))

      const [userId, input] = createApiKey.mock.calls[0]
      expect(userId).toBe(1)
      expect(input.name).toBe('mcp')
      expect(input.sources).toEqual(['integration:notion'])
      expect(input.keyHash).toBe(hashApiKey(res.body.key))
      expect(input).not.toHaveProperty('key')

      listApiKeys.mockResolvedValue([{ id: 1, name: 'mcp', prefix: input.prefix }])
      const listed = await request(app).get('/')
      expect(JSON.stringify(listed.body)).not.toContain(res.body.key)
    })

    it('defaults the source scope to an empty list', async () => {
      countApiKeys.mockResolvedValue(0)
      createApiKey.mockResolvedValue({ id: 1, name: 'mcp' })

      const res = await request(app).post('/').send({ name: 'mcp' })

      expect(res.status).toBe(201)
      expect(createApiKey.mock.calls[0][1].sources).toEqual([])
    })

    it('trims the name', async () => {
      countApiKeys.mockResolvedValue(0)
      createApiKey.mockResolvedValue({ id: 1, name: 'mcp' })

      await request(app).post('/').send({ name: '  mcp  ' })

      expect(createApiKey.mock.calls[0][1].name).toBe('mcp')
    })

    it('rejects a missing name', async () => {
      const res = await request(app).post('/').send({ sources: [] })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Name is required')
      expect(createApiKey).not.toHaveBeenCalled()
    })

    it('rejects a name over the length limit', async () => {
      const res = await request(app)
        .post('/')
        .send({ name: 'a'.repeat(81) })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('too long')
      expect(createApiKey).not.toHaveBeenCalled()
    })

    it('rejects a sources list that is not an array of strings', async () => {
      const res = await request(app)
        .post('/')
        .send({ name: 'mcp', sources: [42] })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Sources must be an array')
      expect(createApiKey).not.toHaveBeenCalled()
    })

    it('rejects more sources than the limit allows', async () => {
      const res = await request(app)
        .post('/')
        .send({ name: 'mcp', sources: Array.from({ length: 51 }, (_, i) => `repo-${i}`) })

      expect(res.status).toBe(400)
      expect(createApiKey).not.toHaveBeenCalled()
    })

    it('returns 422 once the per-user limit is reached', async () => {
      countApiKeys.mockResolvedValue(20)

      const res = await request(app).post('/').send({ name: 'mcp' })

      expect(res.status).toBe(422)
      expect(res.body.error).toContain('20 API keys')
      expect(createApiKey).not.toHaveBeenCalled()
    })

    it('returns 500 when the DB fails', async () => {
      countApiKeys.mockResolvedValue(0)
      createApiKey.mockRejectedValue(new Error('boom'))

      const res = await request(app).post('/').send({ name: 'mcp' })

      expect(res.status).toBe(500)
    })
  })

  describe('DELETE /:id', () => {
    it('rejects a non-numeric id', async () => {
      const res = await request(app).delete('/nope')

      expect(res.status).toBe(400)
      expect(revokeApiKey).not.toHaveBeenCalled()
    })

    it('revokes the key scoped to its owner', async () => {
      revokeApiKey.mockResolvedValue(true)

      const res = await request(app).delete('/5')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(revokeApiKey).toHaveBeenCalledWith(5, 1)
    })

    it('returns 404 when the key does not exist or is not owned', async () => {
      revokeApiKey.mockResolvedValue(false)

      const res = await request(app).delete('/5')

      expect(res.status).toBe(404)
    })

    it('returns 500 when the DB fails', async () => {
      revokeApiKey.mockRejectedValue(new Error('boom'))

      const res = await request(app).delete('/5')

      expect(res.status).toBe(500)
    })
  })

  describe('requests authenticated with an API key', () => {
    it.each([
      ['get', '/'],
      ['post', '/'],
      ['delete', '/5'],
    ])('rejects %s %s with 403', async (method, path) => {
      const keyApp = buildApp({ user: { id: 1 }, apiKey: { id: 9, sources: [] } })

      const res = await request(keyApp)[method](path)

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('cannot manage API keys')
      expect(listApiKeys).not.toHaveBeenCalled()
      expect(createApiKey).not.toHaveBeenCalled()
      expect(revokeApiKey).not.toHaveBeenCalled()
    })
  })
})
