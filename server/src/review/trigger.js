// Pure detection of a Review Trigger from a GitHub webhook
// delivery. Returns a normalized trigger object, or null when the event is not
// an explicit request for Soporti to review an open pull request.
// GitHub constrains owner and repo names to these characters; anything else is
// a malformed payload and must not reach the reviewer prompt or the API.
const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export function detectTrigger({ eventName, payload, reviewerLogin, label }) {
  if (eventName !== 'pull_request') return null

  const pr = payload?.pull_request
  if (!pr || pr.state !== 'open') return null
  if (!pr.head?.sha) return null

  const repoFullName = payload.repository?.full_name
  if (!repoFullName || !REPO_FULL_NAME.test(repoFullName)) return null

  if (payload.action === 'review_requested') {
    const requested = payload.requested_reviewer?.login
    if (!requested || !reviewerLogin) return null
    if (requested.toLowerCase() !== reviewerLogin.toLowerCase()) return null
    return buildTrigger('review_requested', repoFullName, pr)
  }

  if (payload.action === 'labeled') {
    const added = payload.label?.name
    if (!label || !added || added.toLowerCase() !== label.toLowerCase()) return null
    return buildTrigger('labeled', repoFullName, pr)
  }

  return null
}

function buildTrigger(kind, repoFullName, pr) {
  return {
    kind,
    repoFullName,
    prNumber: pr.number,
    headSha: pr.head.sha,
    baseRef: pr.base?.ref ?? '',
    title: pr.title ?? '',
    body: pr.body ?? '',
    authorLogin: pr.user?.login ?? '',
    draft: Boolean(pr.draft),
    changedLines: (pr.additions ?? 0) + (pr.deletions ?? 0),
    dedupeKey: `${repoFullName}#${pr.number}@${pr.head.sha}`,
  }
}
