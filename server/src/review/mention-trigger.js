import { PR_HEAD_PLACEHOLDER, REVIEW_KIND_MENTION_COMMAND } from '../constants.js'
import { buildTrigger } from './trigger.js'

const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const COMMAND_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mentionsLogin(body, login) {
  return new RegExp(`(^|[^\\w@])@${escapeRegExp(login)}(?![\\w-])`, 'i').test(body)
}

function isTrustedReviewCommand(comment, login) {
  if (!COMMAND_ASSOCIATIONS.has(comment.author_association)) return false

  return new RegExp(`^\\s*@${escapeRegExp(login)}\\s+review(?![\\w-])`, 'i').test(comment.body)
}

function resolvePrNumber(eventName, payload) {
  if (eventName === 'issue_comment') return payload.issue?.pull_request ? payload.issue.number : null
  if (eventName === 'pull_request_review_comment') return payload.pull_request?.number ?? null

  return null
}

export function detectMention({ eventName, payload, reviewerLogin }) {
  if (!reviewerLogin) return null
  if (payload?.action !== 'created') return null

  const comment = payload.comment
  if (!comment?.id || !comment.body) return null

  const author = comment.user?.login ?? ''
  if (author.toLowerCase() === reviewerLogin.toLowerCase()) return null
  if (!mentionsLogin(comment.body, reviewerLogin)) return null

  const repoFullName = payload.repository?.full_name
  if (!repoFullName || !REPO_FULL_NAME.test(repoFullName)) return null

  const prNumber = resolvePrNumber(eventName, payload)
  if (!prNumber) return null

  const channel = eventName === 'issue_comment' ? 'issue' : 'review_thread'
  if (isTrustedReviewCommand(comment, reviewerLogin)) {
    return buildReviewCommand(channel, repoFullName, prNumber, comment)
  }
  if (channel === 'issue') return buildMention(channel, repoFullName, prNumber, comment)

  return {
    ...buildMention(channel, repoFullName, prNumber, comment),
    path: comment.path ?? null,
    line: comment.line ?? null,
    diffHunk: comment.diff_hunk ?? '',
    inReplyToId: comment.in_reply_to_id ?? null,
  }
}

function buildReviewCommand(channel, repoFullName, prNumber, comment) {
  const pr = { number: prNumber, head: { sha: PR_HEAD_PLACEHOLDER } }

  return {
    ...buildTrigger(REVIEW_KIND_MENTION_COMMAND, repoFullName, pr),
    channel,
    commentId: comment.id,
  }
}

function buildMention(channel, repoFullName, prNumber, comment) {
  return {
    kind: 'mention',
    channel,
    repoFullName,
    prNumber,
    commentId: comment.id,
    commentBody: comment.body,
    commentAuthor: comment.user?.login ?? '',
    dedupeKey: `${repoFullName}#${prNumber}@mention-${comment.id}`,
  }
}
