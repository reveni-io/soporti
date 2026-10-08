import { listPullRequestReviews, listReviewThreads, listIssueComments, compareCommits } from '../github/client.js'
import { isSameLogin, shortSha } from '../github/sanitize.js'

const MAX_OWN_REVIEWS = 3
const MAX_HUMAN_REVIEWS = 10
const MAX_THREADS = 40
const MAX_THREAD_COMMENTS = 10
const MAX_CONVERSATION_COMMENTS = 20
const MAX_REVIEW_BODY_CHARS = 3000
const MAX_COMMENT_CHARS = 1000
const ANCESTOR_STATUSES = new Set(['ahead', 'identical'])

export async function loadReviewHistory(
  { repoFullName, prNumber, headSha, reviewerLogin, files },
  { logger = console }
) {
  const subject = `${repoFullName}#${prNumber}`

  if (!reviewerLogin) {
    logger.warn(`[review] Reviewer login unknown for ${subject}; reviewing without the PR history`)
    return null
  }

  try {
    const [reviews, threads, comments] = await Promise.all([
      listPullRequestReviews(repoFullName, prNumber),
      listReviewThreads(repoFullName, prNumber),
      listIssueComments(repoFullName, prNumber),
    ])

    const history = buildHistory({ reviews, threads, comments, reviewerLogin })
    const changes = history.lastReviewedSha
      ? await loadChangesSince({ repoFullName, baseSha: history.lastReviewedSha, headSha, files }, logger)
      : null

    return { ...history, changes }
  } catch (err) {
    logger.warn(`[review] Could not load the review history of ${subject} (${err.message}); reviewing it from scratch`)
    return null
  }
}

function buildHistory({ reviews, threads, comments, reviewerLogin }) {
  const isOwn = login => isSameLogin(login, reviewerLogin)
  const submitted = reviews.filter(review => review.state !== 'PENDING')
  const ownReviews = submitted.filter(review => isOwn(review.user?.login))
  const startedThreads = threads.filter(thread => thread.comments.length > 0)

  return {
    lastReviewedSha: ownReviews.at(-1)?.commit_id ?? null,
    ownReviews: withBody(
      ownReviews
        .slice(-MAX_OWN_REVIEWS)
        .map(review => ({ commitId: review.commit_id, body: truncate(review.body, MAX_REVIEW_BODY_CHARS) }))
    ),
    ownThreads: capThreads(startedThreads.filter(thread => isOwn(thread.comments[0].author))),
    humanReviews: withBody(
      submitted
        .filter(review => !isOwn(review.user?.login))
        .map(review => ({
          author: review.user?.login ?? '',
          state: review.state,
          body: truncate(review.body, MAX_REVIEW_BODY_CHARS),
        }))
    ).slice(-MAX_HUMAN_REVIEWS),
    humanThreads: capThreads(startedThreads.filter(thread => !isOwn(thread.comments[0].author))),
    conversation: withBody(
      comments
        .filter(comment => !isOwn(comment.user?.login))
        .map(comment => ({ author: comment.user?.login ?? '', body: truncate(comment.body, MAX_COMMENT_CHARS) }))
    ).slice(-MAX_CONVERSATION_COMMENTS),
  }
}

async function loadChangesSince({ repoFullName, baseSha, headSha, files }, logger) {
  try {
    const comparison = await compareCommits(repoFullName, baseSha, headSha)
    if (!ANCESTOR_STATUSES.has(comparison.status)) return { status: 'diverged' }

    const prFilenames = new Set(files.map(file => file.filename))
    const changed = comparison.files.filter(file => prFilenames.has(file.filename))

    return { status: 'incremental', files: changed }
  } catch (err) {
    logger.warn(`[review] Could not compare ${shortSha(baseSha)}...${shortSha(headSha)} (${err.message})`)
    return { status: 'unavailable' }
  }
}

function capThreads(threads) {
  return threads.slice(-MAX_THREADS).map(thread => {
    const [root, ...replies] = thread.comments
    const kept = thread.isResolved ? [root] : [root, ...replies.slice(-(MAX_THREAD_COMMENTS - 1))]

    return {
      ...thread,
      comments: kept.map(comment => ({ ...comment, body: truncate(comment.body, MAX_COMMENT_CHARS) })),
    }
  })
}

function withBody(entries) {
  return entries.filter(entry => entry.body)
}

function truncate(text, limit) {
  const value = String(text ?? '').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}
