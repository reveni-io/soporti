import { AUTO_APPROVE_DECIDED_BY_JEV, AUTO_APPROVE_INFO_ROLE, AUTO_APPROVE_SHADOW } from '../constants.js'
import { ruleIdOf } from './auto-approve-rules.js'
import { renderDetails, tableCell } from './markdown.js'

const CONFIDENCE_DIGITS = 2
const LIMIT_UNITS = { 'review-effort': ' mins' }
const GATES_HEADER = [
  '| Gate | Limit or role | Review fact | Jev’s answer | Confidence | Check |',
  '| --- | --- | --- | --- | --- | --- |',
]
const QUESTIONS_HEADER = ['| Question | Jev’s answer | Confidence | Check |', '| --- | --- | --- | --- |']

function formatConfidence(value) {
  return Number(value).toFixed(CONFIDENCE_DIGITS)
}

function describeCheck(row, minConfidence) {
  if (row.unsure) return `⛔ Veto (not sure: ${formatConfidence(row.confidence)} < ${formatConfidence(minConfidence)})`

  return row.flagged ? '⛔ Veto' : '✅ OK'
}

function describeLimit(gate) {
  if (gate.role === AUTO_APPROVE_INFO_ROLE) return AUTO_APPROVE_INFO_ROLE
  if (gate.limit === null) return gate.role

  return `≤ ${gate.limit}${LIMIT_UNITS[ruleIdOf(gate.questionId)] ?? ''}`
}

function describeGateCheck(gate, minConfidence) {
  if (gate.role === AUTO_APPROVE_INFO_ROLE) return '➖ Info'
  if (gate.factVeto) return '⛔ Veto (review fact)'

  return describeCheck(gate, minConfidence)
}

function gateRow(gate, minConfidence) {
  const cells = [
    gate.label,
    describeLimit(gate),
    gate.fact,
    gate.answer ?? 'no answer',
    formatConfidence(gate.confidence),
    describeGateCheck(gate, minConfidence),
  ]

  return `| ${cells.map(tableCell).join(' | ')} |`
}

function questionRow(row, minConfidence) {
  const cells = [
    row.question,
    row.answer ?? 'no answer',
    formatConfidence(row.confidence),
    describeCheck(row, minConfidence),
  ]

  return `| ${cells.map(tableCell).join(' | ')} |`
}

function describeJevOutcome({ repo, mode, approve, pendingOnly }, reviewerLogin) {
  const name = `\`${repo}\``
  const held = pendingOnly ? 'the CI gate has not passed yet' : 'a gate or a question vetoed the approval'
  const retry = reviewerLogin ? `: comment \`@${reviewerLogin} review\` to request one` : ''

  if (mode === AUTO_APPROVE_SHADOW && approve) {
    return [
      '👁️ Auto-approve · shadow: would approve',
      `${name} is in \`shadow\` mode. No gate or question vetoed it, so Soporti would have approved this PR. Nothing was approved: review it as usual.`,
    ]
  }
  if (mode === AUTO_APPROVE_SHADOW) {
    return [
      '👁️ Auto-approve · shadow: would not approve',
      `${name} is in \`shadow\` mode and ${held}, so Soporti would not have approved this PR. Review it as usual.`,
    ]
  }
  if (approve) {
    return [
      '✅ Auto-approve · approved',
      `${name} is set to \`on\` and no gate or question vetoed it, so Soporti approved this PR.`,
    ]
  }
  if (pendingOnly) {
    return [
      '⏳ Auto-approve · not approved yet',
      `${name} is set to \`on\`, but the CI gate has not passed yet. Soporti checks again on the next review${retry}.`,
    ]
  }

  return [
    '⛔ Auto-approve · not approved',
    `${name} is set to \`on\`, but a gate or a question vetoed the approval. Review it as usual.`,
  ]
}

function describeTodaySummary(isShadow, approve) {
  if (isShadow) return `👁️ Auto-approve · shadow: would ${approve ? '' : 'not '}approve as today`

  return approve ? '✅ Auto-approve · approved as today' : '⚪ Auto-approve · not approved as today'
}

function describeTodayOutcome({ repo, mode, approve, jevAsked, reason }) {
  const cause = jevAsked ? `Jev could not decide (${reason})` : 'Jev is off for this repo'
  const rule = approve
    ? 'the change is trivial and nothing blocks it'
    : 'only trivial changes with nothing blocking are approved'
  const isShadow = mode === AUTO_APPROVE_SHADOW
  const outcome = isShadow ? ' Nothing was approved: review it as usual.' : ''

  return [describeTodaySummary(isShadow, approve), `${cause}, so \`${repo}\` was decided as today: ${rule}.${outcome}`]
}

export function renderAutoApprove(autoApprove, { reviewerLogin = null } = {}) {
  if (!autoApprove) return null

  const isJev = autoApprove.decidedBy === AUTO_APPROVE_DECIDED_BY_JEV
  const [summary, text] = isJev ? describeJevOutcome(autoApprove, reviewerLogin) : describeTodayOutcome(autoApprove)
  const gates = autoApprove.gates.map(gate => gateRow(gate, autoApprove.minConfidence))
  const gatesTable =
    gates.length > 0 && renderDetails(`Gates (${gates.length})`, [...GATES_HEADER, ...gates].join('\n'))

  return renderDetails(summary, [text, gatesTable].filter(Boolean).join('\n\n'), { open: true })
}

export function renderJevAnswers(autoApprove) {
  if (autoApprove?.decidedBy !== AUTO_APPROVE_DECIDED_BY_JEV || autoApprove.questions.length === 0) return null

  const { questions, setVersion, model, minConfidence } = autoApprove
  const vetoes = questions.filter(row => row.flagged || row.unsure).length
  const verdict = vetoes > 0 ? `vetoed · ${vetoes} answer${vetoes === 1 ? '' : 's'}` : 'no veto'
  const rows = questions.map(row => questionRow(row, minConfidence))

  return renderDetails(`🛡️ Jev · ${verdict} · set v${setVersion} · ${model}`, [...QUESTIONS_HEADER, ...rows].join('\n'))
}

export function describeJevPass(autoApprove) {
  if (!autoApprove?.jevAsked) return ''

  return autoApprove.decidedBy === AUTO_APPROVE_DECIDED_BY_JEV ? ', jev' : ', jev (⚠️ unavailable)'
}
