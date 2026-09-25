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

vi.mock('../zendesk/settings.js', async () => {
  const actual = await vi.importActual('../zendesk/settings.js')
  return {
    INVALID_ZENDESK_CONNECTION: actual.INVALID_ZENDESK_CONNECTION,
    describeZendeskConnection: actual.describeZendeskConnection,
    getZendeskConnection: vi.fn(),
    connectZendesk: vi.fn(),
    disconnectZendesk: vi.fn(),
    setZendeskWrites: vi.fn(),
    setZendeskView: vi.fn(),
  }
})

const { getCustomInstructions, updateCustomInstructions } = await import('../db/users.js')
const { isGranolaConfigured, setGranolaApiKey } = await import('../granola/settings.js')
const { MAX_INSTRUCTIONS_LENGTH } = await import('../constants.js')
const { getZendeskConnection, connectZendesk, disconnectZendesk, setZendeskWrites, setZendeskView } =
  await import('../zendesk/settings.js')
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

describe('user Zendesk routes', () => {
  const API_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'
  const CONNECTION = {
    subdomain: 'acme',
    email: 'ana@acme.com',
    apiToken: API_TOKEN,
    writesEnabled: false,
    viewId: null,
  }
  const PUBLIC_CONNECTION = {
    connected: true,
    subdomain: 'acme',
    email: 'ana@acme.com',
    writesEnabled: false,
    viewId: null,
  }
  const DISCONNECTED = { connected: false, subdomain: null, email: null, writesEnabled: false, viewId: null }
  let app

  function invalidConnection(message) {
    return Object.assign(new Error(message), { code: 'INVALID_ZENDESK_CONNECTION' })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 7 }
      next()
    })
    app.use('/', userRouter)
  })

  it('describes the connection of the requesting user without the API token', async () => {
    getZendeskConnection.mockResolvedValue(CONNECTION)

    const res = await request(app).get('/zendesk')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(PUBLIC_CONNECTION)
    expect(JSON.stringify(res.body)).not.toContain(API_TOKEN)
    expect(getZendeskConnection).toHaveBeenCalledWith(7)
  })

  it('reports a user without a connection as disconnected', async () => {
    getZendeskConnection.mockResolvedValue(null)

    const res = await request(app).get('/zendesk')

    expect(res.body).toEqual(DISCONNECTED)
  })

  it('returns 500 when the connection cannot be read', async () => {
    getZendeskConnection.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/zendesk')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to load the Zendesk connection.')
  })

  it('connects the account of the requesting user and never echoes the token back', async () => {
    connectZendesk.mockResolvedValue(CONNECTION)

    const res = await request(app)
      .put('/zendesk')
      .send({ subdomain: 'acme', email: 'ana@acme.com', apiToken: API_TOKEN })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(PUBLIC_CONNECTION)
    expect(connectZendesk).toHaveBeenCalledTimes(1)
    expect(connectZendesk).toHaveBeenCalledWith(7, { subdomain: 'acme', email: 'ana@acme.com', apiToken: API_TOKEN })
  })

  it('answers 400 with the reason when the credentials are invalid', async () => {
    connectZendesk.mockRejectedValue(invalidConnection('That does not look like a Zendesk API token.'))

    const res = await request(app).put('/zendesk').send({ subdomain: 'acme', email: 'ana@acme.com', apiToken: 'x' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('That does not look like a Zendesk API token.')
  })

  it('returns a generic 500 when the connection cannot be saved', async () => {
    connectZendesk.mockRejectedValue(new Error('db down'))

    const res = await request(app)
      .put('/zendesk')
      .send({ subdomain: 'acme', email: 'ana@acme.com', apiToken: API_TOKEN })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to save the Zendesk connection.')
  })

  it('disconnects the account of the requesting user', async () => {
    disconnectZendesk.mockResolvedValue(undefined)

    const res = await request(app).delete('/zendesk')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(DISCONNECTED)
    expect(disconnectZendesk).toHaveBeenCalledWith(7)
  })

  it('returns 500 when the connection cannot be removed', async () => {
    disconnectZendesk.mockRejectedValue(new Error('db down'))

    const res = await request(app).delete('/zendesk')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to disconnect Zendesk.')
  })

  it('switches the write access on for the requesting user', async () => {
    setZendeskWrites.mockResolvedValue({ ...CONNECTION, writesEnabled: true })

    const res = await request(app).put('/zendesk/writes').send({ enabled: true })

    expect(res.status).toBe(200)
    expect(res.body.writesEnabled).toBe(true)
    expect(setZendeskWrites).toHaveBeenCalledWith(7, true)
  })

  it('rejects a write toggle that is not a boolean', async () => {
    const res = await request(app).put('/zendesk/writes').send({ enabled: 'yes' })

    expect(res.status).toBe(400)
    expect(setZendeskWrites).not.toHaveBeenCalled()
  })

  it('answers 404 when toggling writes without a connection', async () => {
    setZendeskWrites.mockResolvedValue(null)

    const res = await request(app).put('/zendesk/writes').send({ enabled: true })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Zendesk is not connected.')
  })

  it('returns 500 when the write access cannot be saved', async () => {
    setZendeskWrites.mockRejectedValue(new Error('db down'))

    const res = await request(app).put('/zendesk/writes').send({ enabled: false })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to save the Zendesk write access.')
  })

  it('scopes the connection to a view, and clears it when the id is missing', async () => {
    setZendeskView.mockResolvedValue({ ...CONNECTION, viewId: '42' })

    const scoped = await request(app).put('/zendesk/view').send({ viewId: '42' })
    await request(app).put('/zendesk/view').send({})

    expect(scoped.status).toBe(200)
    expect(scoped.body.viewId).toBe('42')
    expect(setZendeskView).toHaveBeenNthCalledWith(1, 7, '42')
    expect(setZendeskView).toHaveBeenNthCalledWith(2, 7, '')
  })

  it('rejects a view id that is not a string or not a number', async () => {
    const wrongType = await request(app).put('/zendesk/view').send({ viewId: 42 })
    setZendeskView.mockRejectedValue(invalidConnection('A Zendesk view id is a number.'))
    const wrongValue = await request(app).put('/zendesk/view').send({ viewId: 'mine' })

    expect(wrongType.status).toBe(400)
    expect(wrongValue.status).toBe(400)
    expect(wrongValue.body.error).toBe('A Zendesk view id is a number.')
  })

  it('answers 404 when scoping a view without a connection', async () => {
    setZendeskView.mockResolvedValue(null)

    const res = await request(app).put('/zendesk/view').send({ viewId: '42' })

    expect(res.status).toBe(404)
  })

  it('returns 500 when the view cannot be saved', async () => {
    setZendeskView.mockRejectedValue(new Error('db down'))

    const res = await request(app).put('/zendesk/view').send({ viewId: '42' })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to save the Zendesk view.')
  })
})
