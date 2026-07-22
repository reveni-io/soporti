import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { createGithubWebhookRouter } from './webhook.js'

const SECRET = 'webhook-secret'

function sign(body) {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`
}

function triggerPayload() {
  return {
    action: 'review_requested',
    requested_reviewer: { login: 'soporti-bot' },
    repository: { full_name: 'acme-io/app' },
    pull_request: {
      number: 7,
      state: 'open',
      title: 'Fix rounding',
      body: '',
      user: { login: 'dev' },
      head: { sha: 'deadbeef' },
      base: { ref: 'main' },
      additions: 3,
      deletions: 1,
    },
  }
}

function buildApp(queue, { getSecret = async () => SECRET } = {}) {
  const app = express()
  app.use(
    '/api/webhooks/github',
    createGithubWebhookRouter({
      getSecret,
      label: 'soporti-review',
      getReviewerLogin: () => 'soporti-bot',
      queue,
    })
  )
  return app
}

function post(app, payload, { signature, event = 'pull_request' } = {}) {
  const body = JSON.stringify(payload)
  return request(app)
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', event)
    .set('X-Hub-Signature-256', signature ?? sign(body))
    .send(body)
}

describe('POST /api/webhooks/github', () => {
  let queue

  beforeEach(() => {
    queue = { enqueue: vi.fn(() => ({ accepted: true })) }
  })

  it('queues a review for a valid signed trigger and responds 202', async () => {
    const res = await post(buildApp(queue), triggerPayload())

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: true })
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'review_requested', dedupeKey: 'acme-io/app#7@deadbeef' })
    )
  })

  it('queues a reply for a signed comment that mentions the reviewer', async () => {
    const payload = {
      action: 'created',
      repository: { full_name: 'acme-io/app' },
      issue: { number: 7, pull_request: { url: 'x' } },
      comment: { id: 100, body: 'oye @soporti-bot, la HU sc-1234 dice otra cosa', user: { login: 'dev' } },
    }

    const res = await post(buildApp(queue), payload, { event: 'issue_comment' })

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: true })
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'mention', channel: 'issue', dedupeKey: 'acme-io/app#7@mention-100' })
    )
  })

  it('accepts but does not queue comments without a mention', async () => {
    const payload = {
      action: 'created',
      repository: { full_name: 'acme-io/app' },
      issue: { number: 7, pull_request: { url: 'x' } },
      comment: { id: 101, body: 'just chatting', user: { login: 'dev' } },
    }

    const res = await post(buildApp(queue), payload, { event: 'issue_comment' })

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: false })
    expect(queue.enqueue).not.toHaveBeenCalled()
  })

  it('rejects an invalid signature with 401 and never touches the queue', async () => {
    const res = await post(buildApp(queue), triggerPayload(), { signature: 'sha256=' + '0'.repeat(64) })

    expect(res.status).toBe(401)
    expect(queue.enqueue).not.toHaveBeenCalled()
  })

  it('logs a warning on invalid signature so secret mismatches are visible server-side', async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const app = express()
    app.use(
      '/api/webhooks/github',
      createGithubWebhookRouter({
        getSecret: async () => SECRET,
        label: 'soporti-review',
        getReviewerLogin: () => 'soporti-bot',
        queue,
        logger,
      })
    )

    const body = JSON.stringify(triggerPayload())
    await request(app)
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-GitHub-Delivery', 'delivery-guid-123')
      .set('X-Hub-Signature-256', 'sha256=' + '0'.repeat(64))
      .send(body)

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0][0]).toContain('secret mismatch')
    expect(logger.warn.mock.calls[0][0]).toContain('delivery=delivery-guid-123')
  })

  it('rejects a missing signature header with 401', async () => {
    const body = JSON.stringify(triggerPayload())
    const res = await request(buildApp(queue))
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .send(body)

    expect(res.status).toBe(401)
    expect(queue.enqueue).not.toHaveBeenCalled()
  })

  it('accepts but does not queue non-trigger events', async () => {
    const payload = { ...triggerPayload(), action: 'synchronize' }
    const res = await post(buildApp(queue), payload)

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: false })
    expect(queue.enqueue).not.toHaveBeenCalled()
  })

  it('accepts but does not queue events of another type', async () => {
    const res = await post(buildApp(queue), triggerPayload(), { event: 'issues' })

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: false })
  })

  it('rejects unparseable JSON with 400 when correctly signed', async () => {
    const body = '{not json'
    const res = await request(buildApp(queue))
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-Hub-Signature-256', sign(body))
      .send(body)

    expect(res.status).toBe(400)
  })

  it('reports a deduped job as not queued', async () => {
    queue.enqueue.mockReturnValue({ accepted: false, reason: 'in-flight' })
    const res = await post(buildApp(queue), triggerPayload())

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: false, reason: 'in-flight' })
  })

  it('returns 503 when no webhook secret is stored (feature disabled)', async () => {
    const app = buildApp(queue, { getSecret: async () => null })
    const res = await post(app, triggerPayload())

    expect(res.status).toBe(503)
    expect(res.body.error).toContain('not configured')
    expect(queue.enqueue).not.toHaveBeenCalled()
  })

  it('returns 503 when the secret cannot be read (DB down)', async () => {
    const app = buildApp(queue, {
      getSecret: async () => {
        throw new Error('db down')
      },
    })
    const res = await post(app, triggerPayload())

    expect(res.status).toBe(503)
    expect(queue.enqueue).not.toHaveBeenCalled()
  })
})
