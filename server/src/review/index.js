import config from '../config.js'
import { getAuthenticatedLogin } from '../github/client.js'
import { getWebhookSecret } from '../github/settings.js'
import { createGithubWebhookRouter } from './webhook.js'
import { ReviewQueue } from './queue.js'
import { runReview } from './reviewer.js'
import { runMention } from './mention.js'

// Mounts the GitHub webhook on the app. Must run BEFORE any body parser, auth
// or rate-limit middleware: the route needs GitHub's raw bytes to verify the
// HMAC signature, and that signature is its authentication. Always mounted —
// the secret lives in the database (admin panel → GitHub) and is checked per
// delivery, so the feature activates without a restart.
export function setupReviewWebhook(app, { logger = console } = {}) {
  // The login whose review requests and mentions trigger Soporti. Resolved
  // from the token at boot unless pinned via REVIEW_REVIEWER_LOGIN; until it
  // resolves, the label trigger already works.
  const state = { reviewerLogin: config.review.reviewerLogin, resolving: false }

  // A single boot resolution that fails (transient GitHub outage) would leave
  // review-request and mention triggers dead until a restart. Instead, retry
  // lazily: every webhook reads the login, and a read while it is still unset
  // kicks off a fresh (deduped) resolution for the next delivery.
  const resolveReviewerLogin = () => {
    if (state.reviewerLogin || state.resolving) return
    state.resolving = true
    getAuthenticatedLogin()
      .then(login => {
        state.reviewerLogin = login
        logger.log(`[review] Reviewer login resolved: ${login}, label: ${config.review.label}`)
      })
      .catch(err => {
        logger.error(`[review] Could not resolve the reviewer login (${err.message}); label trigger still active`)
      })
      .finally(() => {
        state.resolving = false
      })
  }

  const getReviewerLogin = () => {
    if (!state.reviewerLogin) resolveReviewerLogin()
    return state.reviewerLogin
  }

  // One queue for both job kinds: reviews and mention replies share the
  // concurrency budget and the in-flight dedupe.
  const queue = new ReviewQueue({
    processor: job => (job.kind === 'mention' ? runMention(job, { logger }) : runReview(job, { logger })),
    concurrency: config.review.concurrency,
  })

  app.use(
    '/api/webhooks/github',
    createGithubWebhookRouter({
      getSecret: getWebhookSecret,
      label: config.review.label,
      getReviewerLogin,
      queue,
      logger,
    })
  )

  // Warm up the reviewer login only when the feature is actually enabled
  // (secret stored): on unconfigured installs the GitHub token is likely
  // missing too and eager resolution would just log errors at every boot.
  // The per-delivery lazy retry in getReviewerLogin covers everything else.
  if (!state.reviewerLogin) {
    getWebhookSecret()
      .then(secret => {
        if (secret) resolveReviewerLogin()
      })
      .catch(() => {})
  }

  logger.log(`[review] GitHub webhook mounted at /api/webhooks/github, label: ${config.review.label}`)

  return queue
}
