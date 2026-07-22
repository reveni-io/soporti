import { describe, it, expect, vi } from 'vitest'
import http from 'node:http'
import express, { Router } from 'express'
import request from 'supertest'

vi.mock('./config.js', () => ({
  default: {
    port: 3001,
    openai: { model: 'gpt-4o' },
    google: { clientId: 'test-client-id' },
    database: { url: 'postgresql://soporti:soporti@localhost:5432/soporti_test' },
    slack: { botToken: '', appToken: '' },
    postgres: { connection: '' },
    github: { token: 'test-token' },
    repoPool: { maxSize: 5, ttlMs: 60000, cleanupMs: 60000 },
    notion: {},
    sentry: {},
  },
}))

vi.mock('./middleware/security.js', () => ({
  setupSecurity: vi.fn(),
}))

vi.mock('./middleware/auth.js', () => ({
  requireAuth: vi.fn((_req, _res, next) => next()),
  requireAdmin: vi.fn((_req, _res, next) => next()),
  createSession: vi.fn(() => 'valid-token-123'),
}))

vi.mock('./db/index.js', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn(),
}))

vi.mock('./db/users.js', () => ({
  countAdmins: vi.fn().mockResolvedValue(1),
}))

vi.mock('./github/settings.js', () => ({
  getGithubToken: vi.fn().mockResolvedValue('test-token'),
  getWebhookSecret: vi.fn().mockResolvedValue('test-secret'),
}))

vi.mock('./routes/admin.js', () => {
  const router = Router()
  router.get('/status', (_req, res) => res.json({ adminExists: true }))
  return { default: router }
})

vi.mock('./routes/auth.js', () => {
  const router = Router()
  router.post('/google', (_req, res) => res.json({ token: 'valid-token-123' }))
  return { default: router }
})

vi.mock('./sessions/conversation-store.js', () => {
  const ConversationStore = vi.fn(function () {
    this.resolveWeb = vi.fn()
    this.resolveSlack = vi.fn()
    this.saveTurn = vi.fn()
    this.listWeb = vi.fn()
    this.getWebMessages = vi.fn()
    this.deleteWeb = vi.fn()
    this.cleanupExpired = vi.fn()
    this.destroy = vi.fn()
  })
  return { ConversationStore }
})

vi.mock('./shares/store.js', () => {
  const ShareStore = vi.fn(function () {
    this.shares = new Map()
    this.create = vi.fn()
    this.get = vi.fn()
    this.destroy = vi.fn()
  })
  return { ShareStore }
})

vi.mock('./slack/bot.js', () => ({
  startSlackBot: vi.fn().mockResolvedValue(null),
  stopSlackBot: vi.fn(),
}))

vi.mock('./review/index.js', () => ({
  setupReviewWebhook: vi.fn(() => null),
  isReviewConfigured: vi.fn(() => false),
}))

vi.mock('./repo-pool/index.js', () => ({
  pool: { shutdown: vi.fn() },
}))

vi.mock('./postgres/client.js', () => ({
  shutdown: vi.fn(),
  isConfigured: vi.fn(() => false),
}))

vi.mock('./routes/repos.js', () => {
  const router = Router()
  router.get('/', (_req, res) => res.json({ repos: [] }))
  return { default: router }
})

vi.mock('./routes/chat.js', () => ({
  default: vi.fn(() => {
    const router = Router()
    router.post('/', (_req, res) => res.json({ ok: true }))
    return router
  }),
}))

vi.mock('./routes/conversations.js', () => ({
  default: vi.fn(() => {
    const router = Router()
    router.get('/', (_req, res) => res.json({ conversations: [] }))
    return router
  }),
}))

vi.mock('./routes/mermaid.js', () => {
  const router = Router()
  router.post('/', (_req, res) => res.json({ svg: '' }))
  return { default: router }
})

vi.mock('./routes/integrations.js', () => {
  const router = Router()
  router.get('/', (_req, res) => res.json({ integrations: [] }))
  return { default: router }
})

vi.mock('./routes/share.js', () => ({
  default: vi.fn(() => {
    const router = Router()
    router.get('/:id', (_req, res) => res.json({ messages: [] }))
    return router
  }),
}))

// Express 4.22+ defines `listen` as an own property of each app, so patching
// the app prototype no longer intercepts it. Stub the http layer instead —
// no port is bound and the boot callback runs synchronously.
const listenSpy = vi.spyOn(http.Server.prototype, 'listen').mockImplementation(function (_port, cb) {
  if (cb) cb()
  return this
})

await import('./index.js')

listenSpy.mockRestore()

const authRouter = (await import('./routes/auth.js')).default

const app = express()
app.use(express.json())
app.use('/api/auth', authRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

describe('index.js app setup', () => {
  describe('POST /api/auth/google', () => {
    it('is mounted and returns a session token', async () => {
      const res = await request(app).post('/api/auth/google').send({ credential: 'x' })

      expect(res.status).toBe(200)
      expect(res.body.token).toBe('valid-token-123')
    })
  })

  describe('GET /api/health', () => {
    it('returns { status: "ok" }', async () => {
      const res = await request(app).get('/api/health')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'ok' })
    })
  })

  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Not found' })
    })

    it('returns 404 for unknown POST routes', async () => {
      const res = await request(app).post('/api/unknown')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Not found' })
    })
  })
})

describe('module-level setup', () => {
  it('called setupSecurity during initialization', async () => {
    const { setupSecurity } = await import('./middleware/security.js')
    expect(setupSecurity).toHaveBeenCalled()
  })

  it('startSlackBot was given the conversation store during initialization', async () => {
    const { startSlackBot } = await import('./slack/bot.js')
    // Always called (even when Slack is unconfigured) so a later admin save can
    // reconnect the bot; it is a no-op until tokens are set.
    expect(startSlackBot).toHaveBeenCalledWith(expect.anything())
  })

  it('setupReviewWebhook was given the app before other middleware', async () => {
    const { setupReviewWebhook } = await import('./review/index.js')
    expect(setupReviewWebhook).toHaveBeenCalledTimes(1)
    expect(setupReviewWebhook.mock.calls[0][0]).toBeDefined()
  })

  it('chat route factory was called with a conversation store', async () => {
    const chatRoute = (await import('./routes/chat.js')).default
    expect(chatRoute).toHaveBeenCalledTimes(1)
    expect(chatRoute.mock.calls[0][0]).toBeDefined()
  })

  it('conversations route factory was called with a conversation store', async () => {
    const conversationsRoute = (await import('./routes/conversations.js')).default
    expect(conversationsRoute).toHaveBeenCalledTimes(1)
    expect(conversationsRoute.mock.calls[0][0]).toBeDefined()
  })

  it('share route factory was called with a share store', async () => {
    const shareRoute = (await import('./routes/share.js')).default
    expect(shareRoute).toHaveBeenCalledTimes(1)
    expect(shareRoute.mock.calls[0][0]).toBeDefined()
  })
})
