const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mentionsLogin(body, login) {
  return new RegExp(`(^|[^\\w@])@${escapeRegExp(login)}(?![\\w-])`, 'i').test(body)
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

  if (eventName === 'issue_comment') {
    if (!payload.issue?.pull_request || !payload.issue.number) return null
    return buildMention('issue', repoFullName, payload.issue.number, comment)
  }

  if (eventName === 'pull_request_review_comment') {
    const prNumber = payload.pull_request?.number
    if (!prNumber) return null
    return {
      ...buildMention('review_thread', repoFullName, prNumber, comment),
      path: comment.path ?? null,
      line: comment.line ?? null,
      diffHunk: comment.diff_hunk ?? '',
      inReplyToId: comment.in_reply_to_id ?? null,
    }
  }

  return null
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
