import path from 'node:path'
import { JEV_CHECK_ANSWERED } from '../constants.js'
import { listGuards } from '../guards/registry.js'
import { runJevCheck } from '../jev/check.js'
import { collectReviewFacts } from './review-facts.js'

const APPROVE = 'APPROVE'
const COMMENT = 'COMMENT'
const REVIEW_FILENAME = 'review.md'
const GUARDS_FAILED = 'the guards could not run'
const NAME_EDGE = '[^\\p{L}\\p{N}]'
const REGEXP_SPECIAL_RE = /[.*+?^${}()|[\]\\]/g

function reviewGuidelines(standards) {
  return (standards?.documents ?? []).filter(doc => path.posix.basename(doc.path).toLowerCase() === REVIEW_FILENAME)
}

function namePattern(name) {
  const escaped = name.replace(REGEXP_SPECIAL_RE, '\\$&')

  return new RegExp(`(^|${NAME_EDGE})${escaped}(?=${NAME_EDGE}|$)`, 'giu')
}

export function findNamedGuards(guards, text) {
  const longestFirst = [...guards].sort((a, b) => b.name.length - a.name.length)
  const named = []
  let remaining = text

  for (const guard of longestFirst) {
    const pattern = namePattern(guard.name)
    if (!pattern.test(remaining)) continue

    named.push(guard)
    remaining = remaining.replace(pattern, '$1 ')
  }

  return guards.filter(guard => named.includes(guard))
}

function buildJevState({ pullRequest, review }) {
  return {
    pullRequest: {
      repository: pullRequest.repoFullName,
      number: pullRequest.prNumber,
      title: pullRequest.title,
      description: pullRequest.body,
    },
    review: collectReviewFacts(review),
    diff: review.files
      .filter(file => !file.generated && typeof file.patch === 'string')
      .map(file => `--- ${file.filename}\n${file.patch}`)
      .join('\n'),
  }
}

async function checkGuard(guard, state) {
  const result = await runJevCheck({ project: guard.id, state })
  const answered = result.status === JEV_CHECK_ANSWERED

  return {
    guard: guard.name,
    answered,
    reason: answered ? null : result.reason,
    setVersion: result.setVersion ?? null,
    model: result.model ?? null,
    minConfidence: answered ? result.minConfidence : null,
    rows: answered ? result.rows : [],
  }
}

function hasWarning(check) {
  return check.rows.some(row => row.flagged || row.unsure)
}

function decide(checks) {
  const unavailable = checks.find(check => !check.answered)
  if (unavailable)
    return { approve: false, reason: `the ${unavailable.guard} guard could not run (${unavailable.reason})` }

  return { approve: !checks.some(hasWarning), reason: null }
}

async function evaluate(guards, context) {
  const state = buildJevState(context)
  const checks = await Promise.all(guards.map(guard => checkGuard(guard, state)))

  return { checks, ...decide(checks) }
}

async function findGuardsToPass(standards) {
  const guidelines = reviewGuidelines(standards)
  if (guidelines.length === 0) return []

  return findNamedGuards(await listGuards(), guidelines.map(doc => doc.content).join('\n'))
}

export async function decideAutoApprove(context, { logger = console } = {}) {
  const { todayEvent } = context

  let outcome
  try {
    const guards = await findGuardsToPass(context.standards)
    if (guards.length === 0) return { event: todayEvent, autoApprove: null }

    outcome = await evaluate(guards, context)
  } catch (err) {
    logger.error(`[review] Could not run the guards of ${context.pullRequest.repoFullName}:`, err)
    outcome = { approve: false, reason: GUARDS_FAILED, checks: [] }
  }

  return { event: todayEvent === APPROVE && !outcome.approve ? COMMENT : todayEvent, autoApprove: outcome }
}
