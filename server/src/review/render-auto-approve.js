import { PERCENT } from '../constants.js'
import { renderDetails, tableCell } from './markdown.js'

const QUESTIONS_HEADER = ['| Question | Jev’s answer | Confidence | Check |', '| --- | --- | --- | --- |']

function formatConfidence(value) {
  return String(Math.round(Number(value) * PERCENT))
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

function describeSkipped(checks) {
  return checks.map(check => `The **${check.guard}** guard could not run (${check.reason}), so it did not count.`)
}

function describeOutcome({ approve, checks }) {
  const answered = checks.filter(check => check.answered)
  const skipped = describeSkipped(checks.filter(check => !check.answered))

  if (answered.length === 0) return ['⚪ Guards · could not run', [...skipped, 'The usual rule decided.'].join(' ')]
  if (approve) {
    const passed = `Soporti passed this PR through ${listGuards(answered.map(check => check.guard))}, and none raised a warning.`
    return ['✅ Guards · no warnings', [passed, ...skipped].join(' ')]
  }

  const warned = answered.filter(check => countWarnings(check) > 0).map(check => check.guard)
  const why = `Soporti did not approve this PR because ${listGuards(warned)} raised a warning. Review it as usual.`

  return ['⛔ Guards · not approved', [why, ...skipped].join(' ')]
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
    `🛡️ ${check.guard} · ${verdict} · set v${check.setVersion}`,
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
