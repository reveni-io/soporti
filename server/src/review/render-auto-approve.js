import { AUTO_APPROVE_SHADOW } from '../constants.js'
import { renderDetails, tableCell } from './markdown.js'

const CONFIDENCE_DIGITS = 2
const QUESTIONS_HEADER = ['| Question | Jev’s answer | Confidence | Check |', '| --- | --- | --- | --- |']

function formatConfidence(value) {
  return Number(value).toFixed(CONFIDENCE_DIGITS)
}

function describeCheck(row, minConfidence) {
  if (row.unsure)
    return `⛔ Warning (not sure: ${formatConfidence(row.confidence)} < ${formatConfidence(minConfidence)})`

  return row.flagged ? '⛔ Warning' : '✅ OK'
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

function countWarnings(check) {
  return check.rows.filter(row => row.flagged || row.unsure).length
}

function listGuards(names) {
  const quoted = names.map(name => `**${name}**`)
  const list = quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}` : quoted[0]

  return `the ${list} guard${names.length === 1 ? '' : 's'}`
}

function describeWhyNot({ reason, checks }) {
  if (reason) return reason

  const warned = checks.filter(check => countWarnings(check) > 0).map(check => check.guard)

  return `${listGuards(warned)} raised a warning`
}

function describeOutcome(autoApprove) {
  const { repo, mode, approve, checks } = autoApprove
  const name = `\`${repo}\``
  const clean = approve && `${listGuards(checks.map(check => check.guard))} raised no warning`

  if (mode === AUTO_APPROVE_SHADOW) {
    return approve
      ? [
          '👁️ Auto-approve · shadow: would approve',
          `${name} is in \`shadow\` mode and ${clean}, so Soporti would have approved this PR. Nothing was approved: review it as usual.`,
        ]
      : [
          '👁️ Auto-approve · shadow: would not approve',
          `${name} is in \`shadow\` mode and ${describeWhyNot(autoApprove)}, so Soporti would not have approved this PR. Review it as usual.`,
        ]
  }

  return approve
    ? ['✅ Auto-approve · approved', `${name} is set to \`on\` and ${clean}, so Soporti approved this PR.`]
    : [
        '⛔ Auto-approve · not approved',
        `${name} is set to \`on\`, but ${describeWhyNot(autoApprove)}. Review it as usual.`,
      ]
}

export function renderAutoApprove(autoApprove) {
  if (!autoApprove) return null

  const [summary, text] = describeOutcome(autoApprove)

  return renderDetails(summary, text, { open: true })
}

function renderGuardAnswers(check) {
  const warnings = countWarnings(check)
  const verdict = warnings > 0 ? `${warnings} warning${warnings === 1 ? '' : 's'}` : 'no warnings'
  const rows = check.rows.map(row => questionRow(row, check.minConfidence))

  return renderDetails(
    `🛡️ ${check.guard} · ${verdict} · set v${check.setVersion} · ${check.model}`,
    [...QUESTIONS_HEADER, ...rows].join('\n')
  )
}

export function renderJevAnswers(autoApprove) {
  const answered = (autoApprove?.checks ?? []).filter(check => check.answered)
  if (answered.length === 0) return null

  return answered.map(renderGuardAnswers).join('\n\n')
}

export function describeJevPass(autoApprove) {
  const checks = autoApprove?.checks ?? []
  if (checks.length === 0) return ''

  const failed = checks.some(check => !check.answered)

  return `, guards (${checks.map(check => check.guard).join(', ')})${failed ? ' (⚠️ unavailable)' : ''}`
}
