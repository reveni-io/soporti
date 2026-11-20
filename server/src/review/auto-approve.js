import path from 'node:path'
import {
  AUTO_APPROVE_DECIDED_BY_JEV,
  AUTO_APPROVE_DECIDED_BY_NONE,
  AUTO_APPROVE_DOCUMENT,
  AUTO_APPROVE_OFF,
  AUTO_APPROVE_ON,
  JEV_CHECK_ANSWERED,
} from '../constants.js'
import { recordAutoApproveEvaluation } from '../db/auto-approve-evaluations.js'
import { getJevDocument } from '../db/jev-documents.js'
import { listGuards } from '../guards/registry.js'
import { runJevCheck } from '../jev/check.js'
import { collectReviewFacts } from './review-facts.js'

const APPROVE = 'APPROVE'
const COMMENT = 'COMMENT'
const REVIEW_FILENAME = 'review.md'
const NO_REVIEW_MD = 'the repo has no REVIEW.md'
const NO_GUARD_NAMED = 'its REVIEW.md names no guard'
const GUARDS_FAILED = 'the guards could not run'
const NAME_EDGE = '[^\\p{L}\\p{N}]'
const REGEXP_SPECIAL_RE = /[.*+?^${}()|[\]\\]/g

export async function loadAutoApproveRepo(repoFullName, { logger = console } = {}) {
  try {
    const document = await getJevDocument(AUTO_APPROVE_DOCUMENT)
    const repos = document?.data?.repos ?? []

    return repos.find(repo => repo.name.toLowerCase() === repoFullName.toLowerCase()) ?? null
  } catch (err) {
    logger.error(`[review] Could not load the auto-approve settings of ${repoFullName}:`, err)
    return null
  }
}

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

function notEvaluated(reason) {
  return { approve: false, decidedBy: AUTO_APPROVE_DECIDED_BY_NONE, reason, checks: [] }
}

async function evaluate(context) {
  const guidelines = reviewGuidelines(context.standards)
  if (guidelines.length === 0) return notEvaluated(NO_REVIEW_MD)

  const guards = findNamedGuards(await listGuards(), guidelines.map(doc => doc.content).join('\n'))
  if (guards.length === 0) return notEvaluated(NO_GUARD_NAMED)

  const state = buildJevState(context)
  const checks = await Promise.all(guards.map(guard => checkGuard(guard, state)))

  return { decidedBy: AUTO_APPROVE_DECIDED_BY_JEV, checks, ...decide(checks) }
}

async function recordEvaluation({ repo, pullRequest }, outcome, logger) {
  try {
    await recordAutoApproveEvaluation({
      repo: repo.name,
      prNumber: pullRequest.prNumber,
      headSha: pullRequest.headSha,
      mode: repo.mode,
      wouldApprove: outcome.approve,
      decidedBy: outcome.decidedBy,
    })
  } catch (err) {
    logger.error(`[review] Could not record the auto-approve evaluation of ${repo.name}:`, err)
  }
}

export async function decideAutoApprove(context, { logger = console } = {}) {
  const { repo, todayEvent } = context
  if (!repo) return { event: todayEvent, autoApprove: null }
  if (repo.mode === AUTO_APPROVE_OFF) return { event: COMMENT, autoApprove: null }

  let outcome
  try {
    outcome = await evaluate(context)
  } catch (err) {
    logger.error(`[review] Could not run the guards of ${context.pullRequest.repoFullName}:`, err)
    outcome = notEvaluated(GUARDS_FAILED)
  }
  await recordEvaluation(context, outcome, logger)

  return {
    event: repo.mode === AUTO_APPROVE_ON && outcome.approve ? APPROVE : COMMENT,
    autoApprove: { repo: repo.name, mode: repo.mode, ...outcome },
  }
}
