import config from '../config.js'
import { getAuthenticatedLogin } from '../github/client.js'
import { getWebhookSecret } from '../github/settings.js'
import { createGithubWebhookRouter } from './webhook.js'
import { ReviewQueue } from './queue.js'
import { runReview } from './reviewer.js'
import { runMention } from './mention.js'

export function setupReviewWebhook(app, { logger = console } = {}) {
  const state = { reviewerLogin: config.review.reviewerLogin, resolving: false }

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
