import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const verifyGoogleCredential = vi.fn()
const upsertGoogleUser = vi.fn()
const findUserByEmail = vi.fn()
const findUserById = vi.fn()
const touchLastLogin = vi.fn()
const createSession = vi.fn(() => 'session-token')
const verifyPassword = vi.fn()

const getAuthMethods = vi.fn()
const getGoogleClientId = vi.fn()
const getGoogleClientSecret = vi.fn()
const exchangeGoogleCode = vi.fn()
const saveGoogleConnection = vi.fn()
const removeGoogleConnection = vi.fn()

vi.mock('../auth/google.js', () => ({
  verifyGoogleCredential,
  exchangeGoogleCode,
  GOOGLE_SIGN_IN_REJECTED: 'DOMAIN_NOT_ALLOWED',
}))
vi.mock('../auth/password.js', () => ({ verifyPassword, DUMMY_HASH: 'dummy-hash' }))
vi.mock('../auth/auth-methods.js', () => ({ getAuthMethods }))
vi.mock('../auth/google-settings.js', () => ({ getGoogleClientId, getGoogleClientSecret }))
vi.mock('../google-workspace/settings.js', async () => {
  const actual = await vi.importActual('../google-workspace/settings.js')
  return { grantsWorkspaceAccess: actual.grantsWorkspaceAccess, saveGoogleConnection, removeGoogleConnection }
})
vi.mock('../db/users.js', () => ({ upsertGoogleUser, findUserByEmail, findUserById, touchLastLogin }))
vi.mock('../middleware/auth.js', () => ({ createSession }))

const authRouter = (await import('./auth.js')).default

let authenticated = {}

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  Object.assign(req, authenticated)
  next()
})
app.use('/api/auth', authRouter)

beforeEach(() => {
  verifyGoogleCredential.mockReset()
  upsertGoogleUser.mockReset()
  findUserByEmail.mockReset()
  findUserById.mockReset()
  authenticated = {}
  touchLastLogin.mockReset()
  verifyPassword.mockReset()
  createSession.mockClear()
  getAuthMethods.mockReset()
  getAuthMethods.mockResolvedValue({ google: true, password: true })
  getGoogleClientId.mockReset()
  getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')
  getGoogleClientSecret.mockReset()
  getGoogleClientSecret.mockResolvedValue(null)
  exchangeGoogleCode.mockReset()
  saveGoogleConnection.mockReset()
  removeGoogleConnection.mockReset()
})

describe('POST /api/auth/google', () => {
  it('returns 400 when credential is missing', async () => {
    const res = await request(app).post('/api/auth/google').send({})

    expect(res.status).toBe(400)
  })

  it('returns a token and user (including role) for a valid credential', async () => {
    verifyGoogleCredential.mockResolvedValue({
      googleId: '1',
      email: 'jane@example.com',
      name: 'Jane',
      picture: 'p.png',
    })
    upsertGoogleUser.mockResolvedValue({
      id: 7,
      googleId: '1',
      email: 'jane@example.com',
      name: 'Jane',
      picture: 'p.png',
      role: 'user',
    })

    const res = await request(app).post('/api/auth/google').send({ credential: 'tok' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe('session-token')
    expect(res.body.user).toEqual({ email: 'jane@example.com', name: 'Jane', picture: 'p.png', role: 'user' })
    expect(upsertGoogleUser).toHaveBeenCalledTimes(1)
  })

  it('returns 403 when the domain is not allowed', async () => {
    verifyGoogleCredential.mockImplementation(async () => {
      const err = new Error('Only @example.com accounts are allowed.')
      err.code = 'DOMAIN_NOT_ALLOWED'
      throw err
    })

    const res = await request(app).post('/api/auth/google').send({ credential: 'tok' })

    expect(res.status).toBe(403)
    expect(upsertGoogleUser).not.toHaveBeenCalled()
  })

  it('returns 401 for an invalid credential', async () => {
    verifyGoogleCredential.mockImplementation(async () => {
      throw new Error('bad token')
    })

    const res = await request(app).post('/api/auth/google').send({ credential: 'tok' })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/google/code', () => {
  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
  const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
  const PROFILE = { googleId: '1', email: 'jane@example.com', name: 'Jane', picture: 'p.png' }
  const USER = { id: 7, googleId: '1', email: 'jane@example.com', name: 'Jane', picture: 'p.png', role: 'user' }
  const TOKENS = {
    refreshToken: 'refresh-token',
    accessToken: 'access-token',
    expiresAt: 1_900_000_000_000,
    scopes: ['openid', 'email', GMAIL_SCOPE, CALENDAR_SCOPE],
  }

  it('returns 400 when the code is missing', async () => {
    const res = await request(app).post('/api/auth/google/code').send({})

    expect(res.status).toBe(400)
    expect(exchangeGoogleCode).not.toHaveBeenCalled()
  })

  it('returns 400 when the code is not a string', async () => {
    const res = await request(app).post('/api/auth/google/code').send({ code: 42 })

    expect(res.status).toBe(400)
    expect(exchangeGoogleCode).not.toHaveBeenCalled()
  })

  it('returns 400 when the code is longer than 2048 characters', async () => {
    const res = await request(app)
      .post('/api/auth/google/code')
      .send({ code: 'x'.repeat(2049) })

    expect(res.status).toBe(400)
    expect(exchangeGoogleCode).not.toHaveBeenCalled()
  })

  it('signs the user in and stores the Google connection with the granted scopes', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: TOKENS })
    upsertGoogleUser.mockResolvedValue(USER)

    const res = await request(app).post('/api/auth/google/code').send({ code: 'auth-code' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      token: 'session-token',
      user: { email: 'jane@example.com', name: 'Jane', picture: 'p.png', role: 'user' },
    })
    expect(exchangeGoogleCode).toHaveBeenCalledWith('auth-code')
    expect(upsertGoogleUser).toHaveBeenCalledWith(PROFILE)
    expect(saveGoogleConnection).toHaveBeenCalledTimes(1)
    expect(saveGoogleConnection).toHaveBeenCalledWith(7, { email: 'jane@example.com', ...TOKENS })
  })

  it('keeps the stored connection when Google sends no refresh token', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: { ...TOKENS, refreshToken: null } })
    upsertGoogleUser.mockResolvedValue(USER)

    const res = await request(app).post('/api/auth/google/code').send({ code: 'auth-code' })

    expect(res.status).toBe(200)
    expect(saveGoogleConnection).not.toHaveBeenCalled()
    expect(removeGoogleConnection).not.toHaveBeenCalled()
  })

  it('drops the stored connection when the user unticked both Gmail and Calendar', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: { ...TOKENS, scopes: ['openid', 'email'] } })
    upsertGoogleUser.mockResolvedValue(USER)

    const res = await request(app).post('/api/auth/google/code').send({ code: 'auth-code' })

    expect(res.status).toBe(200)
    expect(saveGoogleConnection).not.toHaveBeenCalled()
    expect(removeGoogleConnection).toHaveBeenCalledTimes(1)
    expect(removeGoogleConnection).toHaveBeenCalledWith(7)
  })

  it('still signs the user in when storing the connection fails', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: TOKENS })
    upsertGoogleUser.mockResolvedValue(USER)
    saveGoogleConnection.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).post('/api/auth/google/code').send({ code: 'auth-code' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe('session-token')
  })

  it('returns 403 when the account is not allowed to sign in', async () => {
    exchangeGoogleCode.mockRejectedValue(
      Object.assign(new Error('Only @example.com accounts are allowed.'), { code: 'DOMAIN_NOT_ALLOWED' })
    )

    const res = await request(app).post('/api/auth/google/code').send({ code: 'auth-code' })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Only @example.com accounts are allowed.' })
    expect(upsertGoogleUser).not.toHaveBeenCalled()
  })

  it('returns 401 for an invalid or expired code', async () => {
    exchangeGoogleCode.mockRejectedValue(Object.assign(new Error('expired'), { code: 'INVALID_GOOGLE_CODE' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).post('/api/auth/google/code').send({ code: 'auth-code' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid Google authorization code.' })
    expect(upsertGoogleUser).not.toHaveBeenCalled()
  })

  it('returns 500 when the user cannot be persisted', async () => {
    exchangeGoogleCode.mockResolvedValue({ profile: PROFILE, tokens: TOKENS })
    upsertGoogleUser.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).post('/api/auth/google/code').send({ code: 'auth-code' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to complete login.' })
    expect(saveGoogleConnection).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/login', () => {
  const passwordUser = {
    id: 3,
    email: 'sam@example.com',
    name: 'Sam',
    picture: null,
    role: 'user',
    passwordHash: 'stored-hash',
  }

  it('returns 400 when email or password is missing', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400)
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.io' })).status).toBe(400)
    expect((await request(app).post('/api/auth/login').send({ password: 'secret123' })).status).toBe(400)
    expect(findUserByEmail).not.toHaveBeenCalled()
  })

  it('rejects oversized credentials early without touching the DB or bcrypt', async () => {
    const longEmail = `${'a'.repeat(255)}@x.io`
    const longPassword = 'p'.repeat(73)

    expect((await request(app).post('/api/auth/login').send({ email: longEmail, password: 'secret123' })).status).toBe(
      401
    )
    expect(
      (await request(app).post('/api/auth/login').send({ email: 'sam@example.com', password: longPassword })).status
    ).toBe(401)
    expect(findUserByEmail).not.toHaveBeenCalled()
    expect(verifyPassword).not.toHaveBeenCalled()
  })

  it('returns a token and user for valid credentials', async () => {
    findUserByEmail.mockResolvedValue(passwordUser)
    verifyPassword.mockResolvedValue(true)

    const res = await request(app).post('/api/auth/login').send({ email: 'sam@example.com', password: 'secret123' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBe('session-token')
    expect(res.body.user).toEqual({ email: 'sam@example.com', name: 'Sam', picture: null, role: 'user' })
    expect(verifyPassword).toHaveBeenCalledWith('secret123', 'stored-hash')
    expect(touchLastLogin).toHaveBeenCalledWith(3)
  })

  it('returns a generic 401 for a wrong password', async () => {
    findUserByEmail.mockResolvedValue(passwordUser)
    verifyPassword.mockResolvedValue(false)

    const res = await request(app).post('/api/auth/login').send({ email: 'sam@example.com', password: 'wrong' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid email or password.')
  })

  it('returns the same generic 401 for an unknown email, still hashing (timing safety)', async () => {
    findUserByEmail.mockResolvedValue(null)
    verifyPassword.mockResolvedValue(false)

    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'whatever1' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid email or password.')
    expect(verifyPassword).toHaveBeenCalledWith('whatever1', 'dummy-hash')
  })

  it('returns the same generic 401 for a Google-only account (no passwordHash)', async () => {
    findUserByEmail.mockResolvedValue({ ...passwordUser, passwordHash: null })
    verifyPassword.mockResolvedValue(true)

    const res = await request(app).post('/api/auth/login').send({ email: 'sam@example.com', password: 'secret123' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid email or password.')
    expect(touchLastLogin).not.toHaveBeenCalled()
  })

  it('returns 500 when the lookup fails', async () => {
    findUserByEmail.mockRejectedValue(new Error('db down'))

    const res = await request(app).post('/api/auth/login').send({ email: 'sam@example.com', password: 'secret123' })

    expect(res.status).toBe(500)
  })

  it('rejects regular users with the generic 401 when password login is toggled off', async () => {
    getAuthMethods.mockResolvedValue({ google: true, password: false })
    findUserByEmail.mockResolvedValue(passwordUser)
    verifyPassword.mockResolvedValue(true)

    const res = await request(app).post('/api/auth/login').send({ email: 'sam@example.com', password: 'secret123' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid email or password.')
    expect(touchLastLogin).not.toHaveBeenCalled()
  })

  it('always lets admins in with their password (anti lockout), even when toggled off', async () => {
    getAuthMethods.mockResolvedValue({ google: true, password: false })
    findUserByEmail.mockResolvedValue({ ...passwordUser, role: 'admin' })
    verifyPassword.mockResolvedValue(true)

    const res = await request(app).post('/api/auth/login').send({ email: 'sam@example.com', password: 'secret123' })

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('admin')
  })
})

describe('POST /api/auth/refresh', () => {
  it('issues a fresh session from the current account', async () => {
    authenticated = { user: { id: 7, email: 'jane@example.com', name: 'Jane', role: 'user' } }
    findUserById.mockResolvedValue({
      id: 7,
      email: 'jane@example.com',
      name: 'Jane Doe',
      picture: 'p.png',
      role: 'admin',
    })

    const res = await request(app).post('/api/auth/refresh')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      token: 'session-token',
      user: { email: 'jane@example.com', name: 'Jane Doe', picture: 'p.png', role: 'admin' },
    })
    expect(findUserById).toHaveBeenCalledTimes(1)
    expect(findUserById).toHaveBeenCalledWith(7)
    expect(createSession).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ id: 7, role: 'admin' }))
  })

  it('refuses to turn an API key into a session', async () => {
    authenticated = { user: { id: 7 }, apiKey: { id: 1, sources: [] } }

    const res = await request(app).post('/api/auth/refresh')

    expect(res.status).toBe(403)
    expect(findUserById).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('returns 401 when the account no longer exists', async () => {
    authenticated = { user: { id: 7 } }
    findUserById.mockResolvedValue(null)

    const res = await request(app).post('/api/auth/refresh')

    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('returns a generic 500 when the lookup fails', async () => {
    authenticated = { user: { id: 7 } }
    findUserById.mockRejectedValue(new Error('connection reset'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app).post('/api/auth/refresh')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to refresh the session.' })
  })
})

describe('GET /api/auth/methods', () => {
  it('returns the Google scopes when sign-in is enabled with a client id and a client secret', async () => {
    getAuthMethods.mockResolvedValue({ google: true, password: false })
    getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')
    getGoogleClientSecret.mockResolvedValue('GOCSPX-secret')

    const res = await request(app).get('/api/auth/methods')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      google: true,
      password: false,
      googleScopes: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
    })
  })

  it('returns no Google scopes when Google sign-in is off, even with a client secret', async () => {
    getAuthMethods.mockResolvedValue({ google: false, password: true })
    getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')
    getGoogleClientSecret.mockResolvedValue('GOCSPX-secret')

    const res = await request(app).get('/api/auth/methods')

    expect(res.body.googleScopes).toBeNull()
  })

  it('returns the enabled sign-in methods', async () => {
    getAuthMethods.mockResolvedValue({ google: true, password: true })
    getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')

    const res = await request(app).get('/api/auth/methods')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ google: true, password: true, googleScopes: null })
  })

  it('reports Google disabled when the toggle is on but no client id is configured', async () => {
    getAuthMethods.mockResolvedValue({ google: true, password: true })
    getGoogleClientId.mockResolvedValue(null)

    const res = await request(app).get('/api/auth/methods')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ google: false, password: true, googleScopes: null })
  })

  it('reports Google disabled when the toggle is off even with a client id', async () => {
    getAuthMethods.mockResolvedValue({ google: false, password: true })
    getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')

    const res = await request(app).get('/api/auth/methods')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ google: false, password: true, googleScopes: null })
  })
})
