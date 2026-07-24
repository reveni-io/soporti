import express from 'express'
import { verifySignature } from './signature.js'
import { detectTrigger } from './trigger.js'
import { detectMention } from './mention-trigger.js'

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
      return res.status(503).json({ error: 'PR reviews are not configured. Set the webhook secret in /admin.' })
    }

    const signatureHeader = req.get('x-hub-signature-256')

    if (!verifySignature({ secret, rawBody: req.body, signatureHeader })) {
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
