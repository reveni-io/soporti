import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHelmet = vi.fn(() => 'helmet-middleware')
const mockCors = vi.fn(() => 'cors-middleware')
const mockRateLimit = vi.fn(() => 'rate-limiter')
const mockConfig = { security: { corsOrigins: [], trustProxy: '1' } }

vi.mock('helmet', () => ({ default: mockHelmet }))
vi.mock('cors', () => ({ default: mockCors }))
vi.mock('express-rate-limit', () => ({ default: mockRateLimit }))
vi.mock('../config.js', () => ({ default: mockConfig }))

const { setupSecurity } = await import('./security.js')

describe('setupSecurity', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig.security = { corsOrigins: [], trustProxy: '1' }
    app = {
      set: vi.fn(),
      use: vi.fn(),
      disable: vi.fn(),
    }
  })

  it('sets trust proxy to 1 by default', () => {
    setupSecurity(app)
    expect(app.set).toHaveBeenCalledWith('trust proxy', 1)
  })

  it('disables trust proxy when configured to false (direct client connections)', () => {
    mockConfig.security.trustProxy = 'false'
    setupSecurity(app)
    expect(app.set).toHaveBeenCalledWith('trust proxy', false)
  })

  it('passes named trust proxy presets through', () => {
    mockConfig.security.trustProxy = 'loopback'
    setupSecurity(app)
    expect(app.set).toHaveBeenCalledWith('trust proxy', 'loopback')
  })

  it('applies helmet middleware', () => {
    setupSecurity(app)
    expect(mockHelmet).toHaveBeenCalled()
    expect(app.use).toHaveBeenCalledWith('helmet-middleware')
  })

  it('applies cors middleware allowing any origin when none is configured', () => {
    setupSecurity(app)
    expect(mockCors).toHaveBeenCalledWith({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 3600,
    })
    expect(app.use).toHaveBeenCalledWith('cors-middleware')
  })

  it('restricts cors to the configured origins', () => {
    mockConfig.security.corsOrigins = ['https://app.example.com']
    setupSecurity(app)
    expect(mockCors.mock.calls[0][0].origin).toEqual(['https://app.example.com'])
  })

  it('creates a chat rate limiter with 10 req/min', () => {
    setupSecurity(app)
    const chatCall = mockRateLimit.mock.calls[0][0]
    expect(chatCall.windowMs).toBe(60_000)
    expect(chatCall.limit).toBe(10)
    expect(chatCall.standardHeaders).toBe(true)
    expect(chatCall.legacyHeaders).toBe(false)
    expect(chatCall.message).toEqual({ error: 'Too many requests. Please wait a moment.' })
  })

  it('relies on the default IP key generator (no custom keyGenerator)', () => {
    setupSecurity(app)
    for (const call of mockRateLimit.mock.calls) {
      expect(call[0].keyGenerator).toBeUndefined()
    }
  })

  it('creates a general rate limiter with 60 req/min', () => {
    setupSecurity(app)
    const generalCall = mockRateLimit.mock.calls[1][0]
    expect(generalCall.windowMs).toBe(60_000)
    expect(generalCall.limit).toBe(60)
    expect(generalCall.standardHeaders).toBe(true)
    expect(generalCall.legacyHeaders).toBe(false)
    expect(generalCall.message).toEqual({ error: 'Too many requests. Please wait a moment.' })
  })

  it('creates a strict auth rate limiter (10 attempts / 15 min)', () => {
    setupSecurity(app)
    const authCall = mockRateLimit.mock.calls[2][0]
    expect(authCall.windowMs).toBe(15 * 60_000)
    expect(authCall.limit).toBe(10)
    expect(authCall.message).toEqual({ error: 'Too many attempts. Please try again later.' })
  })

  it('applies chat rate limiter to /api/chat', () => {
    setupSecurity(app)
    expect(app.use).toHaveBeenCalledWith('/api/chat', 'rate-limiter')
  })

  it('applies the auth rate limiter to the credential endpoints', () => {
    setupSecurity(app)
    expect(app.use).toHaveBeenCalledWith('/api/auth/login', 'rate-limiter')
    expect(app.use).toHaveBeenCalledWith('/api/admin/bootstrap', 'rate-limiter')
  })

  it('applies general rate limiter to /api/', () => {
    setupSecurity(app)
    expect(app.use).toHaveBeenCalledWith('/api/', 'rate-limiter')
  })

  it('disables x-powered-by header', () => {
    setupSecurity(app)
    expect(app.disable).toHaveBeenCalledWith('x-powered-by')
  })

  it('calls app.use the expected number of times', () => {
    setupSecurity(app)
    expect(app.use).toHaveBeenCalledTimes(6)
  })
})
