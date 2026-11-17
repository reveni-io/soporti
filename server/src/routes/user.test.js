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
  }
})

vi.mock('../auth/google.js', () => ({
  exchangeGoogleCode: vi.fn(),
  GOOGLE_SIGN_IN_REJECTED: 'DOMAIN_NOT_ALLOWED',
}))

vi.mock('../google-workspace/settings.js', async () => {
  const actual = await vi.importActual('../google-workspace/settings.js')
  return {
    grantsWorkspaceAccess: actual.grantsWorkspaceAccess,
    describeGoogleConnection: vi.fn(),
    disconnectGoogle: vi.fn(),
    removeGoogleConnection: vi.fn(),
    saveGoogleConnection: vi.fn(),
  }
})

const { getCustomInstructions, updateCustomInstructions } = await import('../db/users.js')
const { exchangeGoogleCode } = await import('../auth/google.js')
const { describeGoogleConnection, disconnectGoogle, removeGoogleConnection, saveGoogleConnection } =
  await import('../google-workspace/settings.js')
const { isGranolaConfigured, setGranolaApiKey } = await import('../granola/settings.js')
const { MAX_INSTRUCTIONS_LENGTH } = await import('../constants.js')
const { getZendeskConnection, connectZendesk, disconnectZendesk, setZendeskWrites } =
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
  }
  const PUBLIC_CONNECTION = {
    connected: true,
    subdomain: 'acme',
    email: 'ana@acme.com',
    writesEnabled: false,
  }
  const DISCONNECTED = { connected: false, subdomain: null, email: null, writesEnabled: false }
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
})

describe('user Google routes', () => {
  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
  const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
  const PROFILE = { googleId: '1', email: 'jane@example.com', name: 'Jane', picture: null }
  const TOKENS = {
    refreshToken: 'refresh-token',
    accessToken: 'access-token',
    expiresAt: 1_900_000_000_000,
    scopes: ['openid', 'email', GMAIL_SCOPE],
  }
  const CONNECTED = {
    available: true,
    connected: true,
    email: 'jane@example.com',
    gmail: true,
    calendar: false,
    scopes: ['openid', 'email', 'profile', GMAIL_SCOPE, CALENDAR_SCOPE],
  }
  const DISCONNECTED = { ...CONNECTED, connected: false, email: null, gmail: false }

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

  it('describes the Google connection of the requesting user', async () => {
    describeGoogleConnection.mockResolvedValue(CONNECTED)

    const res = await request(app).get('/google')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(CONNECTED)
    expect(describeGoogleConnection).toHaveBeenCalledWith(7)
  })

  it('returns 500 when the connection cannot be read', async () => {
    describeGoogleConnection.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).get('/google')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the Google connection.' })
  })

  it('connects Google without the sign-in policy and returns the new state', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: TOKENS })
    describeGoogleConnection.mockResolvedValue(CONNECTED)

    const res = await request(app).put('/google').send({ code: 'auth-code' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(CONNECTED)
    expect(exchangeGoogleCode).toHaveBeenCalledWith('auth-code', { enforceSignInPolicy: false })
    expect(saveGoogleConnection).toHaveBeenCalledTimes(1)
    expect(saveGoogleConnection).toHaveBeenCalledWith(7, { email: 'jane@example.com', ...TOKENS })
  })

  it('rejects a missing, non-string or oversized code', async () => {
    const responses = await Promise.all([
      request(app).put('/google').send({}),
      request(app).put('/google').send({ code: 7 }),
      request(app)
        .put('/google')
        .send({ code: 'x'.repeat(2049) }),
    ])

    expect(responses.map(res => res.status)).toEqual([400, 400, 400])
    expect(exchangeGoogleCode).not.toHaveBeenCalled()
  })

  it('answers 422 when Google returned no refresh token', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: { ...TOKENS, refreshToken: null } })

    const res = await request(app).put('/google').send({ code: 'auth-code' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/offline access/)
    expect(saveGoogleConnection).not.toHaveBeenCalled()
    expect(removeGoogleConnection).not.toHaveBeenCalled()
  })

  it('answers 422 and drops the old connection when neither Gmail nor Calendar was granted', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: { ...TOKENS, scopes: ['openid', 'email'] } })

    const res = await request(app).put('/google').send({ code: 'auth-code' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/Gmail or Calendar/)
    expect(saveGoogleConnection).not.toHaveBeenCalled()
    expect(removeGoogleConnection).toHaveBeenCalledTimes(1)
    expect(removeGoogleConnection).toHaveBeenCalledWith(7)
  })

  it('answers 400, never 401, for a code Google does not accept', async () => {
    exchangeGoogleCode.mockRejectedValue(Object.assign(new Error('expired'), { code: 'INVALID_GOOGLE_CODE' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).put('/google').send({ code: 'auth-code' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Google did not accept the authorization. Connect Google again.' })
    expect(saveGoogleConnection).not.toHaveBeenCalled()
  })

  it('answers 403 when Google access is not configured', async () => {
    exchangeGoogleCode.mockRejectedValue(
      Object.assign(new Error('Google access is not configured.'), { code: 'DOMAIN_NOT_ALLOWED' })
    )

    const res = await request(app).put('/google').send({ code: 'auth-code' })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Google access is not configured.' })
  })

  it('returns 500 without the raw error when the connection cannot be saved', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: TOKENS })
    saveGoogleConnection.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).put('/google').send({ code: 'auth-code' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the Google connection.' })
  })

  it('disconnects Google and returns the disconnected state', async () => {
    describeGoogleConnection.mockResolvedValue(DISCONNECTED)

    const res = await request(app).delete('/google')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(DISCONNECTED)
    expect(disconnectGoogle).toHaveBeenCalledTimes(1)
    expect(disconnectGoogle).toHaveBeenCalledWith(7)
  })

  it('returns 500 when Google cannot be disconnected', async () => {
    disconnectGoogle.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).delete('/google')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to disconnect Google.' })
  })
})
