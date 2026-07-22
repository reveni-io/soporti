import express from 'express'
import { verifySignature } from './signature.js'
import { detectTrigger } from './trigger.js'
import { detectMention } from './mention-trigger.js'

// GitHub webhook receiver. Mounted in index.js BEFORE the global JSON parser,
// auth and rate-limit middleware: the HMAC signature is the authentication
// here, and it must be computed over the exact raw bytes GitHub sent.
// The secret lives in the database (admin panel → GitHub) and is resolved per
// delivery, so PR reviews can be enabled/rotated without a restart.
// Always answers fast (GitHub times out at 10s) — reviews run on the queue.
export function createGithubWebhookRouter({ getSecret, label, getReviewerLogin, queue, logger = console }) {
  const router = express.Router()

  router.post('/', express.raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
    let secret
    try {
      secret = await getSecret()
    } catch (err) {
      logger.error(`[review] Could not read the webhook secret: ${err.message}`)
      return res.status(503).json({ error: 'Webhook temporarily unavailable.' })
    }
    if (!secret) {
      // Shows up in GitHub's delivery log, pointing the operator at the fix.
      return res.status(503).json({ error: 'PR reviews are not configured. Set the webhook secret in /admin.' })
    }

    const signatureHeader = req.get('x-hub-signature-256')

    if (!verifySignature({ secret, rawBody: req.body, signatureHeader })) {
      // Almost always a secret mismatch (e.g. rotated on one side only).
      // The delivery id correlates with GitHub's Recent Deliveries UI.
      logger.warn(
        `[review] Webhook delivery rejected: invalid signature — likely a secret mismatch between GitHub and /admin. ` +
          `event=${req.get('x-github-event') ?? 'unknown'}, delivery=${req.get('x-github-delivery') ?? 'unknown'}`
      )
      return res.status(401).json({ error: 'Invalid signature.' })
    }

    let payload
    try {
      payload = JSON.parse(req.body.toString('utf8'))
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload.' })
    }

    const eventName = req.get('x-github-event')
    const reviewerLogin = getReviewerLogin()

    // A delivery is at most one job: a Review Trigger (pull_request events)
    // or a Mention (comment events) — never both.
    const job =
      detectTrigger({ eventName, payload, reviewerLogin, label }) ??
      detectMention({ eventName, payload, reviewerLogin })

    if (!job) {
      return res.status(202).json({ queued: false })
    }

    const result = queue.enqueue(job)
    if (result.accepted) {
      logger.log(`[review] Queued ${job.kind} for ${job.dedupeKey}`)
      return res.status(202).json({ queued: true })
    }

    logger.log(`[review] Skipped ${job.dedupeKey} (${result.reason})`)
    return res.status(202).json({ queued: false, reason: result.reason })
  })

  return router
}
