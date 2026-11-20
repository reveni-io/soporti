import { AUTO_APPROVE_OFF, AUTO_APPROVE_ON, JEV_CHECK_ANSWERED, JEV_GITHUB_DOCUMENT } from '../constants.js'
import { recordAutoApproveEvaluation } from '../db/auto-approve-evaluations.js'
import { getJevDocument } from '../db/jev-documents.js'
import { runJevCheck } from '../jev/check.js'
import { GITHUB_RULES } from '../jev/github-project.js'
import { buildRuleQuestions, checkRuleFact, collectReviewFacts, ruleIdOf } from './auto-approve-rules.js'

const APPROVE = 'APPROVE'
const COMMENT = 'COMMENT'
const DECIDED_BY_JEV = 'jev'
const DECIDED_AS_TODAY = 'today'
const CI_RULE = 'ci'
const PENDING_ANSWER = 'Pending'
const INFO_ROLE = 'info'
const RULE_LABELS = new Map(GITHUB_RULES.map(rule => [rule.id, rule.label]))

export async function loadAutoApproveRepo(repoFullName, { logger = console } = {}) {
  try {
    const document = await getJevDocument(JEV_GITHUB_DOCUMENT)
    const repos = document?.data?.repos ?? []

    return repos.find(repo => repo.name.toLowerCase() === repoFullName.toLowerCase()) ?? null
  } catch (err) {
    logger.error(`[review] Could not load the auto-approve settings of ${repoFullName}:`, err)
    return null
  }
}

function buildJevState({ pullRequest, review }, facts) {
  return {
    pullRequest: {
      repository: pullRequest.repoFullName,
      number: pullRequest.prNumber,
      title: pullRequest.title,
      description: pullRequest.body,
    },
    review: facts,
    diff: review.files
      .filter(file => !file.generated && typeof file.patch === 'string')
      .map(file => `--- ${file.filename}\n${file.patch}`)
      .join('\n'),
  }
}

function asToday(todayEvent, reason, result = null) {
  return {
    approve: todayEvent === APPROVE,
    decidedBy: DECIDED_AS_TODAY,
    reason,
    pendingOnly: false,
    setVersion: result?.setVersion ?? null,
    model: result?.model ?? null,
    minConfidence: null,
    gates: [],
    questions: [],
  }
}

function toGate(row, rulesById, facts) {
  const rule = rulesById.get(ruleIdOf(row.questionId))
  const fact = checkRuleFact(rule, facts)

  return {
    ...row,
    label: RULE_LABELS.get(rule.id),
    role: rule.role,
    limit: rule.limit ?? null,
    fact: fact.answer,
    factVeto: fact.vetoed,
  }
}

function isBlocking(row) {
  return row.flagged || row.unsure || row.factVeto === true
}

function isPendingCi(row) {
  return ruleIdOf(row.questionId) === CI_RULE && row.fact === PENDING_ANSWER
}

function fromJev(result, rules, facts) {
  const rulesById = new Map(rules.map(rule => [rule.id, rule]))
  const gates = result.rows.filter(row => ruleIdOf(row.questionId)).map(row => toGate(row, rulesById, facts))
  const questions = result.rows.filter(row => !ruleIdOf(row.questionId))
  const blocking = [...gates.filter(gate => gate.role !== INFO_ROLE), ...questions].filter(isBlocking)

  return {
    approve: blocking.length === 0,
    decidedBy: DECIDED_BY_JEV,
    reason: null,
    pendingOnly: blocking.length > 0 && blocking.every(isPendingCi),
    setVersion: result.setVersion,
    model: result.model,
    minConfidence: result.minConfidence,
    gates,
    questions,
  }
}

function setRules(set) {
  return set.rules ?? []
}

async function askJev(context, logger) {
  try {
    const facts = collectReviewFacts(context.review, context.repo.denylist)
    const result = await runJevCheck({
      project: JEV_GITHUB_DOCUMENT,
      state: buildJevState(context, facts),
      buildExtraQuestions: set => buildRuleQuestions(setRules(set)),
    })
    if (result.status !== JEV_CHECK_ANSWERED) return asToday(context.todayEvent, result.reason, result)

    return fromJev(result, setRules(result.set), facts)
  } catch (err) {
    logger.error(`[review] Could not ask Jev about ${context.pullRequest.repoFullName}:`, err)
    return asToday(context.todayEvent, 'the Jev check failed')
  }
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

  const outcome = repo.jev ? await askJev(context, logger) : asToday(todayEvent, 'Jev is off for this repo')
  await recordEvaluation(context, outcome, logger)

  const isApproved = repo.mode === AUTO_APPROVE_ON && outcome.approve

  return {
    event: isApproved ? APPROVE : COMMENT,
    autoApprove: { repo: repo.name, mode: repo.mode, jevAsked: repo.jev, ...outcome },
  }
}
