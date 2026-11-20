import { REVIEW_BLOCKING_SEVERITIES } from '../constants.js'
import { classifyMergeRisk } from './render.js'

const NIT_SEVERITY = 'nit'
const SPEC_LENS = 'spec'
const FAILED_PASS = 'failed'
const UNKNOWN = 'unknown'
const POSTED = 'posted'

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

export function collectReviewFacts(review) {
  const { ciStatus, findings, passes, notReviewed, overview, history, fixedThreads } = review

  return {
    ciStatus: describeCi(ciStatus),
    blockingFindings: findings
      .filter(finding => REVIEW_BLOCKING_SEVERITIES.has(finding.severity))
      .map(finding => finding.title),
    specCheck: describeSpec(findings, passes),
    unresolvedThreads: history ? Math.max(0, history.unresolvedThreads - fixedThreads.length) : UNKNOWN,
    walkthrough: overview ? POSTED : 'missing',
    mergeRisk: classifyMergeRisk(findings, notReviewed, passes).level,
    estimatedReviewMinutes: overview ? overview.reviewMinutes : UNKNOWN,
    nitpicks: findings.filter(finding => finding.severity === NIT_SEVERITY).length,
  }
}
