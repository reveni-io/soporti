import { buildGuardTools } from '../agent/guard-tools.js'
import { listUsableGuards } from '../guards/registry.js'

const APPROVE = 'APPROVE'
const COMMENT = 'COMMENT'

function describePullRequest({ pullRequest, files }) {
  return {
    pullRequest: {
      repository: pullRequest.repoFullName,
      number: pullRequest.prNumber,
      title: pullRequest.title,
      description: pullRequest.body,
    },
    diff: files
      .filter(file => !file.generated && typeof file.patch === 'string')
      .map(file => `--- ${file.filename}\n${file.patch}`)
      .join('\n'),
  }
}

export async function buildReviewGuards(context, { logger = console } = {}) {
  const checks = []

  try {
    const guards = await listUsableGuards()
    if (guards.length === 0) return { tools: [], checks }

    const review = { attach: describePullRequest(context), onChecked: check => checks.push(check) }

    return { tools: buildGuardTools({ guards, review }), checks }
  } catch (err) {
    logger.error(`[review] Could not load the guards for ${context.pullRequest.repoFullName}:`, err)
    return { tools: [], checks }
  }
}

function toCheck({ guard, reason, review }) {
  return {
    guard,
    answered: review !== null,
    reason: review ? null : reason,
    setVersion: review?.setVersion ?? null,
    minConfidence: review?.minConfidence ?? null,
    rows: review?.rows ?? [],
  }
}

function hasWarning(check) {
  return check.rows.some(row => row.flagged || row.unsure)
}

export function decideAutoApprove({ todayEvent, guardChecks }) {
  if (guardChecks.length === 0) return { event: todayEvent, autoApprove: null }

  const checks = guardChecks.map(toCheck)
  const approve = !checks.some(hasWarning)

  return { event: todayEvent === APPROVE && !approve ? COMMENT : todayEvent, autoApprove: { approve, checks } }
}
