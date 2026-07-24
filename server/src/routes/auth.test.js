import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const verifyGoogleCredential = vi.fn()
const upsertGoogleUser = vi.fn()
const findUserByEmail = vi.fn()
const touchLastLogin = vi.fn()
const createSession = vi.fn(() => 'session-token')
const verifyPassword = vi.fn()

const getAuthMethods = vi.fn()
const getGoogleClientId = vi.fn()

vi.mock('../auth/google.js', () => ({ verifyGoogleCredential }))
vi.mock('../auth/password.js', () => ({ verifyPassword, DUMMY_HASH: 'dummy-hash' }))
vi.mock('../auth/auth-methods.js', () => ({ getAuthMethods }))
vi.mock('../auth/google-settings.js', () => ({ getGoogleClientId }))
vi.mock('../db/users.js', () => ({ upsertGoogleUser, findUserByEmail, touchLastLogin }))
vi.mock('../middleware/auth.js', () => ({ createSession }))

const authRouter = (await import('./auth.js')).default

const app = express()
app.use(express.json())
app.use('/api/auth', authRouter)

beforeEach(() => {
  verifyGoogleCredential.mockReset()
  upsertGoogleUser.mockReset()
  findUserByEmail.mockReset()
  touchLastLogin.mockReset()
  verifyPassword.mockReset()
  createSession.mockClear()
  getAuthMethods.mockReset()
  getAuthMethods.mockResolvedValue({ google: true, password: true })
  getGoogleClientId.mockReset()
  getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')
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

describe('GET /api/auth/methods', () => {
  it('returns the enabled sign-in methods', async () => {
    getAuthMethods.mockResolvedValue({ google: true, password: true })
    getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')

    const res = await request(app).get('/api/auth/methods')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ google: true, password: true })
  })

  it('reports Google disabled when the toggle is on but no client id is configured', async () => {
    getAuthMethods.mockResolvedValue({ google: true, password: true })
    getGoogleClientId.mockResolvedValue(null)

    const res = await request(app).get('/api/auth/methods')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ google: false, password: true })
  })

  it('reports Google disabled when the toggle is off even with a client id', async () => {
    getAuthMethods.mockResolvedValue({ google: false, password: true })
    getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')

    const res = await request(app).get('/api/auth/methods')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ google: false, password: true })
  })
})
