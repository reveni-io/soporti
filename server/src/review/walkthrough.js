import { createIssueComment, listIssueComments, updateIssueComment } from '../github/client.js'
import { isSameLogin } from '../github/sanitize.js'
import { REVIEW_WALKTHROUGH_MARKER } from '../constants.js'

const NOT_FOUND_STATUS = 404

export async function upsertWalkthrough({ repoFullName, prNumber, reviewerLogin, body }, { logger = console } = {}) {
  try {
    const existing = reviewerLogin ? await findWalkthrough(repoFullName, prNumber, reviewerLogin) : null
    if (existing && (await editWalkthrough(repoFullName, existing.id, body))) return

    await createIssueComment(repoFullName, prNumber, body)
  } catch (err) {
    logger.warn(
      `[review] Could not post the walkthrough on ${repoFullName}#${prNumber} (${err.message}); posting the review anyway`
    )
  }
}

async function findWalkthrough(repoFullName, prNumber, reviewerLogin) {
  const comments = await listIssueComments(repoFullName, prNumber)

  return comments.find(comment => isOwnWalkthrough(comment, reviewerLogin)) ?? null
}

function isOwnWalkthrough(comment, reviewerLogin) {
  return isSameLogin(comment.user?.login, reviewerLogin) && Boolean(comment.body?.includes(REVIEW_WALKTHROUGH_MARKER))
}

async function editWalkthrough(repoFullName, commentId, body) {
  try {
    await updateIssueComment(repoFullName, commentId, body)
    return true
  } catch (err) {
    if (err.status === NOT_FOUND_STATUS) return false
    throw err
  }
}
