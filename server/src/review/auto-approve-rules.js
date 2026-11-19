import { REVIEW_BLOCKING_SEVERITIES } from '../constants.js'
import { globToRegExp } from './diff.js'
import { classifyMergeRisk } from './render.js'

const RULE_PREFIX = 'rule:'
const VETO_ROLE = 'veto'
const NIT_SEVERITY = 'nit'
const SPEC_LENS = 'spec'
const FAILED_PASS = 'failed'
const UNKNOWN = 'unknown'
const MERGE_RISKS = ['Low', 'Medium', 'High']

function always(question) {
  return () => question
}

const RULE_QUESTIONS = {
  ci: always({
    text: 'What is the CI status of the PR?',
    fact: 'ciStatus',
    answers: ['Passed', 'No checks', 'Pending', 'Failed', 'Unknown'],
    vetoes: ['Pending', 'Failed', 'Unknown'],
  }),
  findings: always({
    text: 'Does the review report blocking findings?',
    fact: 'blockingFindings',
    answers: ['Yes', 'No'],
    vetoes: ['Yes'],
  }),
  spec: always({
    text: 'Does the spec check report a blocking finding?',
    fact: 'specCheck',
    answers: ['Yes', 'No', 'No spec', 'Unknown'],
    vetoes: ['Yes', 'Unknown'],
  }),
  threads: always({
    text: 'Are there unresolved review threads?',
    fact: 'unresolvedThreads',
    answers: ['Yes', 'No', 'Unknown'],
    vetoes: ['Yes', 'Unknown'],
  }),
  walkthrough: always({
    text: 'Did the review post its walkthrough?',
    fact: 'walkthrough',
    answers: ['Yes', 'No'],
    vetoes: ['No'],
  }),
  'merge-risk': limit => ({
    text: 'What is the merge risk?',
    fact: 'mergeRisk',
    answers: [...MERGE_RISKS, 'Unknown'],
    vetoes: [...MERGE_RISKS.slice(MERGE_RISKS.indexOf(limit) + 1), 'Unknown'],
  }),
  'review-effort': limit => ({
    text: `Is the estimated review effort at most ${limit} minutes?`,
    fact: 'estimatedReviewMinutes',
    answers: ['Yes', 'No', 'Unknown'],
    vetoes: ['No', 'Unknown'],
  }),
  nitpicks: limit => ({
    text: `Are there at most ${limit} nitpicks?`,
    fact: 'nitpicks',
    answers: ['Yes', 'No'],
    vetoes: ['No'],
  }),
  denylist: always({
    text: 'Does any changed file match the denylist of the repo?',
    fact: 'denylistMatches',
    answers: ['Yes', 'No'],
    vetoes: ['Yes'],
  }),
}

function describeCi(ciStatus) {
  if (!ciStatus) return UNKNOWN

  const states = new Set(ciStatus.checks.map(check => check.state))
  if (states.has('failed')) return 'failed'
  if (states.has('pending')) return 'pending'
  if (ciStatus.incomplete) return UNKNOWN

  return ciStatus.checks.length === 0 ? 'no checks' : 'passed'
}

function describeSpec(findings, passes) {
  const specPasses = passes.filter(pass => pass.lens === SPEC_LENS)
  if (specPasses.length === 0) return 'no spec'
  if (findings.some(finding => finding.lens === SPEC_LENS && REVIEW_BLOCKING_SEVERITIES.has(finding.severity))) {
    return 'blocking finding'
  }

  return specPasses.some(pass => pass.status === FAILED_PASS) ? UNKNOWN : 'no blocking finding'
}

function matchDenylist(files, denylist) {
  const matchers = denylist.map(pattern => globToRegExp(pattern, { isAnchored: pattern.includes('/') }))

  return files.map(file => file.filename).filter(filename => matchers.some(matcher => matcher.test(filename)))
}

export function collectReviewFacts(review, denylist) {
  const { ciStatus, findings, passes, notReviewed, overview, history, fixedThreads, files } = review

  return {
    ciStatus: describeCi(ciStatus),
    blockingFindings: findings
      .filter(finding => REVIEW_BLOCKING_SEVERITIES.has(finding.severity))
      .map(finding => finding.title),
    specCheck: describeSpec(findings, passes),
    unresolvedThreads: history ? Math.max(0, history.unresolvedThreads - fixedThreads.length) : UNKNOWN,
    walkthrough: overview ? 'posted' : 'missing',
    mergeRisk: classifyMergeRisk(findings, notReviewed, passes).level,
    estimatedReviewMinutes: overview ? overview.reviewMinutes : UNKNOWN,
    nitpicks: findings.filter(finding => finding.severity === NIT_SEVERITY).length,
    denylistMatches: matchDenylist(files, denylist),
  }
}

export function buildRuleQuestions(rules) {
  return rules.map(rule => {
    const definition = RULE_QUESTIONS[rule.id](rule.limit)

    return {
      id: `${RULE_PREFIX}${rule.id}`,
      type: 'choice',
      text: definition.text,
      instructions: `Answer only from review.${definition.fact} in the document.`,
      criteria: '',
      answers: definition.answers.map(label => ({
        label,
        criteria: '',
        flag: rule.role === VETO_ROLE && definition.vetoes.includes(label),
      })),
    }
  })
}

export function ruleIdOf(questionId) {
  return questionId.startsWith(RULE_PREFIX) ? questionId.slice(RULE_PREFIX.length) : null
}
