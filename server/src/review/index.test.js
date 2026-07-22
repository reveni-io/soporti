import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import express from 'express'
import request from 'supertest'

const mockRunReview = vi.fn()
const mockRunMention = vi.fn()
const mockGetAuthenticatedLogin = vi.fn()

vi.mock('./reviewer.js', () => ({
  runReview: mockRunReview,
}))

vi.mock('./mention.js', () => ({
  runMention: mockRunMention,
}))

vi.mock('../github/client.js', () => ({
  getAuthenticatedLogin: mockGetAuthenticatedLogin,
}))

vi.mock('../config.js', () => ({
  default: {
    review: {
      label: 'soporti-review',
      reviewerLogin: '',
      maxChangedLines: 4000,
      concurrency: 1,
    },
  },
}))

// The webhook secret lives in the database; overridable per test.
const mockGetWebhookSecret = vi.fn(async () => 'hook-secret')
vi.mock('../github/settings.js', () => ({
  getWebhookSecret: mockGetWebhookSecret,
}))

const { setupReviewWebhook } = await import('./index.js')

const tick = () => new Promise(res => setImmediate(res))
const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

function signedPost(app, payload) {
  const body = JSON.stringify(payload)
  return request(app)
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', 'pull_request')
    .set('X-Hub-Signature-256', `sha256=${createHmac('sha256', 'hook-secret').update(body).digest('hex')}`)
    .send(body)
}

function reviewRequestedPayload(login) {
  return {
    action: 'review_requested',
    requested_reviewer: { login },
    repository: { full_name: 'acme-io/app' },
    pull_request: {
      number: 3,
      state: 'open',
      title: 't',
      body: '',
      user: { login: 'dev' },
      head: { sha: 'cafe123' },
      base: { ref: 'main' },
      additions: 1,
      deletions: 0,
    },
  }
}

describe('setupReviewWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWebhookSecret.mockResolvedValue('hook-secret')
  })

  it('mounts the webhook but rejects deliveries with 503 while no secret is stored', async () => {
    mockGetWebhookSecret.mockResolvedValue(null)

    const app = express()
    const queue = setupReviewWebhook(app, { logger: silentLogger })
    expect(queue).not.toBeNull()

    const res = await signedPost(app, reviewRequestedPayload('soporti-bot'))
    expect(res.status).toBe(503)
    expect(res.body.error).toContain('not configured')
    expect(mockRunReview).not.toHaveBeenCalled()
    // No eager login resolution on unconfigured installs.
    expect(mockGetAuthenticatedLogin).not.toHaveBeenCalled()
  })

  it('mounts the webhook and runs reviews for triggers matching the resolved login', async () => {
    mockGetAuthenticatedLogin.mockResolvedValue('soporti-bot')
    mockRunReview.mockResolvedValue(undefined)

    const app = express()
    const queue = setupReviewWebhook(app, { logger: silentLogger })
    expect(queue).not.toBeNull()
    await tick() // let the login resolution settle

    const res = await signedPost(app, reviewRequestedPayload('soporti-bot'))
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: true })

    await tick()
    expect(mockRunReview).toHaveBeenCalledTimes(1)
    expect(mockRunReview.mock.calls[0][0]).toMatchObject({ dedupeKey: 'acme-io/app#3@cafe123' })
  })

  it('routes mentions to the mention responder, not the reviewer', async () => {
    mockGetAuthenticatedLogin.mockResolvedValue('soporti-bot')
    mockRunMention.mockResolvedValue(undefined)

    const app = express()
    setupReviewWebhook(app, { logger: silentLogger })
    await tick()

    const payload = {
      action: 'created',
      repository: { full_name: 'acme-io/app' },
      issue: { number: 3, pull_request: { url: 'x' } },
      comment: { id: 42, body: 'oye @soporti-bot, ¿esto cuadra?', user: { login: 'dev' } },
    }
    const body = JSON.stringify(payload)
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'issue_comment')
      .set('X-Hub-Signature-256', `sha256=${createHmac('sha256', 'hook-secret').update(body).digest('hex')}`)
      .send(body)

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: true })

    await tick()
    expect(mockRunMention).toHaveBeenCalledTimes(1)
    expect(mockRunMention.mock.calls[0][0]).toMatchObject({ kind: 'mention', dedupeKey: 'acme-io/app#3@mention-42' })
    expect(mockRunReview).not.toHaveBeenCalled()
  })

  it('lazily re-resolves the reviewer login after a transient boot failure', async () => {
    mockGetAuthenticatedLogin.mockRejectedValueOnce(new Error('github down')).mockResolvedValue('soporti-bot')
    mockRunReview.mockResolvedValue(undefined)

    const app = express()
    setupReviewWebhook(app, { logger: silentLogger })
    await tick() // boot resolution fails, login stays empty

    // First review request: login still unset, so it is ignored — but the
    // attempt to read it kicks off a background re-resolution.
    const first = await signedPost(app, reviewRequestedPayload('soporti-bot'))
    expect(first.body).toEqual({ queued: false })
    await tick() // re-resolution settles → login is now 'soporti-bot'

    const second = await signedPost(app, reviewRequestedPayload('soporti-bot'))
    expect(second.body).toEqual({ queued: true })
    await tick()
    expect(mockRunReview).toHaveBeenCalledTimes(1)
  })

  it('ignores review requests for other logins', async () => {
    mockGetAuthenticatedLogin.mockResolvedValue('soporti-bot')

    const app = express()
    setupReviewWebhook(app, { logger: silentLogger })
    await tick()

    const res = await signedPost(app, reviewRequestedPayload('someone-else'))
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: false })
    expect(mockRunReview).not.toHaveBeenCalled()
  })

  it('keeps the label trigger working even if the login cannot be resolved', async () => {
    mockGetAuthenticatedLogin.mockRejectedValue(new Error('github down'))
    mockRunReview.mockResolvedValue(undefined)

    const app = express()
    setupReviewWebhook(app, { logger: silentLogger })
    await tick()

    const payload = {
      ...reviewRequestedPayload('soporti-bot'),
      action: 'labeled',
      requested_reviewer: undefined,
      label: { name: 'soporti-review' },
    }
    const res = await signedPost(app, payload)
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: true })
  })
})
