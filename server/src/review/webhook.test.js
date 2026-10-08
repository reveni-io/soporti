import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import express from 'express'
import request from 'supertest'

const mockCreateIssueCommentReaction = vi.fn()
const mockCreateReviewCommentReaction = vi.fn()

vi.mock('../github/client.js', () => ({
  createIssueCommentReaction: mockCreateIssueCommentReaction,
  createReviewCommentReaction: mockCreateReviewCommentReaction,
}))

const { createGithubWebhookRouter } = await import('./webhook.js')
const { ReviewQueue } = await import('./queue.js')

const SECRET = 'webhook-secret'
const DEBOUNCE_MS = 120_000

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

function commandPayload({ association = 'MEMBER', body = '@soporti-bot review' } = {}) {
  return {
    action: 'created',
    repository: { full_name: 'acme-io/app' },
    issue: { number: 7, pull_request: { url: 'x' } },
    comment: { id: 300, body, user: { login: 'dev' }, author_association: association },
  }
}

function pushPayload(sha, { labels = [{ name: 'soporti-review' }] } = {}) {
  const payload = triggerPayload()
  return {
    ...payload,
    action: 'synchronize',
    requested_reviewer: undefined,
    pull_request: { ...payload.pull_request, head: { sha }, labels },
  }
}

function buildApp(queue, { getSecret = async () => SECRET, logger = console, reviewOnPush = true } = {}) {
  const app = express()
  app.use(
    '/api/webhooks/github',
    createGithubWebhookRouter({
      getSecret,
      label: 'soporti-review',
      reviewOnPush,
      pushDebounceMs: DEBOUNCE_MS,
      getReviewerLogin: () => 'soporti-bot',
      queue,
      logger,
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
    vi.clearAllMocks()
    queue = { enqueue: vi.fn(() => ({ accepted: true })) }
    mockCreateIssueCommentReaction.mockResolvedValue({ id: 1, content: 'eyes' })
    mockCreateReviewCommentReaction.mockResolvedValue({ id: 2, content: 'eyes' })
  })

  it('queues a review for a valid signed trigger and responds 202', async () => {
    const res = await post(buildApp(queue), triggerPayload())

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: true })
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'review_requested',
        dedupeKey: 'acme-io/app#7@deadbeef',
        supersedeKey: 'acme-io/app#7',
      })
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
    expect(queue.enqueue.mock.calls[0][0].supersedeKey).toBeUndefined()
  })

  it('queues a review of the current head for a review command from a member and reacts to the comment', async () => {
    const res = await post(buildApp(queue), commandPayload(), { event: 'issue_comment' })

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: true })
    expect(queue.enqueue).toHaveBeenCalledTimes(1)
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'mention_command',
        headSha: 'HEAD',
        dedupeKey: 'acme-io/app#7@HEAD',
        supersedeKey: 'acme-io/app#7',
      })
    )
    expect(mockCreateIssueCommentReaction).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueCommentReaction).toHaveBeenCalledWith('acme-io/app', 300, 'eyes')
    expect(mockCreateReviewCommentReaction).not.toHaveBeenCalled()
  })

  it('reacts on the review comment when the command is posted in a review thread', async () => {
    const payload = {
      action: 'created',
      repository: { full_name: 'acme-io/app' },
      pull_request: { number: 7 },
      comment: { id: 400, body: '@soporti-bot review', user: { login: 'dev' }, author_association: 'OWNER' },
    }

    const res = await post(buildApp(queue), payload, { event: 'pull_request_review_comment' })

    expect(res.body).toEqual({ queued: true })
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mention_command', commentId: 400 }))
    expect(mockCreateReviewCommentReaction).toHaveBeenCalledTimes(1)
    expect(mockCreateReviewCommentReaction).toHaveBeenCalledWith('acme-io/app', 400, 'eyes')
    expect(mockCreateIssueCommentReaction).not.toHaveBeenCalled()
  })

  it('supersedes a running review of the same PR when a review command arrives', async () => {
    const signals = []
    const realQueue = new ReviewQueue({
      processor: (job, { signal }) => {
        signals.push(signal)
        return new Promise(() => {})
      },
    })
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const app = buildApp(realQueue, { logger })

    await post(app, triggerPayload())
    const res = await post(app, commandPayload(), { event: 'issue_comment' })

    expect(res.body).toEqual({ queued: true })
    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(true)
    expect(logger.log).toHaveBeenCalledWith(
      '[review] Queued mention_command for acme-io/app#7@HEAD (superseding an older review of this PR)'
    )
  })

  it('answers the review command as a plain mention when the author is not a collaborator', async () => {
    const res = await post(buildApp(queue), commandPayload({ association: 'NONE' }), { event: 'issue_comment' })

    expect(res.body).toEqual({ queued: true })
    expect(queue.enqueue).toHaveBeenCalledTimes(1)
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'mention', dedupeKey: 'acme-io/app#7@mention-300' })
    )
    expect(mockCreateIssueCommentReaction).not.toHaveBeenCalled()
  })

  it('does not react when the review command is deduped against a pending one', async () => {
    queue.enqueue.mockReturnValue({ accepted: false, reason: 'in-flight' })

    const res = await post(buildApp(queue), commandPayload(), { event: 'issue_comment' })

    expect(res.body).toEqual({ queued: false, reason: 'in-flight' })
    expect(mockCreateIssueCommentReaction).not.toHaveBeenCalled()
  })

  it('still queues the review when the reaction on the command fails', async () => {
    mockCreateIssueCommentReaction.mockRejectedValue(new Error('rate limited'))
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

    const res = await post(buildApp(queue, { logger }), commandPayload(), { event: 'issue_comment' })

    expect(res.body).toEqual({ queued: true })
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        '[review] Could not react to the review command on acme-io/app#7@HEAD (rate limited)'
      )
    })
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
    const payload = { ...triggerPayload(), action: 'opened' }
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

  describe('review on push', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('queues a delayed re-review for a push to a PR carrying the review label', async () => {
      const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

      const res = await post(buildApp(queue, { logger }), pushPayload('f00d'))

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ queued: true })
      expect(queue.enqueue).toHaveBeenCalledTimes(1)
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'synchronize',
          headSha: 'f00d',
          dedupeKey: 'acme-io/app#7@f00d',
          supersedeKey: 'acme-io/app#7',
          delayMs: DEBOUNCE_MS,
        })
      )
      expect(logger.log).toHaveBeenCalledWith(
        '[review] Queued synchronize for acme-io/app#7@f00d to start in 120s unless a newer push replaces it'
      )
    })

    it('does nothing for a push to a PR without the review label', async () => {
      const res = await post(buildApp(queue), pushPayload('f00d', { labels: [{ name: 'bug' }] }))

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ queued: false })
      expect(queue.enqueue).not.toHaveBeenCalled()
    })

    it('does nothing for a push when review on push is turned off', async () => {
      const res = await post(buildApp(queue, { reviewOnPush: false }), pushPayload('f00d'))

      expect(res.body).toEqual({ queued: false })
      expect(queue.enqueue).not.toHaveBeenCalled()
    })

    it('reviews only the latest head after several pushes within the debounce window', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const processor = vi.fn(async () => {})
      const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
      const app = buildApp(new ReviewQueue({ processor }), { logger })

      await post(app, pushPayload('aaa1'))
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2)
      await post(app, pushPayload('bbb2'))
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2)
      await post(app, pushPayload('ccc3'))
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1)

      expect(processor).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)

      expect(processor).toHaveBeenCalledTimes(1)
      expect(processor.mock.calls[0][0]).toMatchObject({ kind: 'synchronize', headSha: 'ccc3' })
      expect(logger.log).toHaveBeenCalledWith(
        '[review] Queued synchronize for acme-io/app#7@ccc3 to start in 120s unless a newer push replaces it ' +
          '(superseding an older review of this PR)'
      )
    })

    it('aborts a running review when a push lands and reviews the new head after the debounce', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const processor = vi.fn((job, { signal }) => {
        if (job.kind === 'synchronize') return Promise.resolve()
        return new Promise(resolve => signal.addEventListener('abort', resolve))
      })
      const app = buildApp(new ReviewQueue({ processor }))

      await post(app, triggerPayload())
      await vi.advanceTimersByTimeAsync(0)
      await post(app, pushPayload('f00d'))

      expect(processor).toHaveBeenCalledTimes(1)
      expect(processor.mock.calls[0][1].signal.aborted).toBe(true)

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

      expect(processor).toHaveBeenCalledTimes(2)
      expect(processor.mock.calls[1][0]).toMatchObject({ kind: 'synchronize', headSha: 'f00d' })
      expect(processor.mock.calls[1][1].signal.aborted).toBe(false)
    })
  })
})
