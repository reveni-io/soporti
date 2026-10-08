import { shortSha } from '../github/sanitize.js'
import {
  REVIEW_KIND_MENTION_COMMAND,
  REVIEW_KIND_SYNCHRONIZE,
  REVIEW_OVERVIEW_PASS,
  REVIEW_PASS_FAILED,
  REVIEW_SEVERITIES,
  REVIEW_BLOCKING_SEVERITIES,
  REVIEW_WALKTHROUGH_MARKER,
} from '../constants.js'
import { redactSecrets } from './output-guard.js'

const SEVERITIES = {
  critical: { icon: '🔴', label: 'Critical' },
  major: { icon: '🟠', label: 'Major' },
  minor: { icon: '🟡', label: 'Minor' },
  nit: { icon: '🔵', label: 'Nit' },
}
const CATEGORY_LABELS = {
  bug: '🐛 Bug',
  security: '🔒 Security',
  performance: '⚡ Performance',
  maintainability: '📐 Maintainability',
  tests: '🧪 Tests',
  standards: '📏 Standards',
  spec: '📋 Spec',
}
const EFFORT_LABELS = ['Trivial', 'Simple', 'Moderate', 'Complex', 'Very complex']
const CHECK_STATUSES = {
  passed: { icon: '✅', label: 'Passed' },
  warning: { icon: '⚠️', label: 'Warning' },
  failed: { icon: '❌', label: 'Failed' },
  pending: { icon: '⏳', label: 'Pending' },
  skipped: { icon: '➖', label: 'Skipped' },
}
const CI_FAILED = 'failed'
const CI_PENDING = 'pending'
const MAX_CI_NAMES = 5
const TRIGGER_LABELS = { labeled: 'label', [REVIEW_KIND_MENTION_COMMAND]: 'mention', [REVIEW_KIND_SYNCHRONIZE]: 'push' }
const DEFAULT_TRIGGER_LABEL = 'review request'
const MAX_LIST_ENTRIES = 100
const MAX_NITS = 15
const MAX_POST_CHARS = 60_000
const SECTION_SEPARATOR = '\n\n'
const MIN_FENCE_LENGTH = 3
const BACKTICK_RUN = /`+/g
const WHITESPACE_RUN = /\s+/g
const TRAILING_NEWLINES = /\n+$/
const LINE_BREAK = /\r?\n/g
const TABLE_SPECIAL_CHARACTER = /[\\|]/g
const TRUNCATION_NOTE = "> ✂️ **Truncated**: some sections were left out to stay under GitHub's comment size limit."
const REVIEW_FOOTER = '<sub>Automated review by Soporti</sub>'
const MISSING_OVERVIEW_NOTE =
  '> ⚠️ The overview is unavailable for this review: its pass did not complete. The findings are in the review.'
const NO_STANDARDS_DETAILS = 'No standards documents found'
const NO_SPEC_DETAILS = 'No spec available'
const AGENT_PROMPT_INTRO = 'Verify this finding against the current code and only fix it if it is still valid.'
const ALL_AGENT_PROMPTS_INTRO = 'Verify each finding against the current code and only fix it if needed.'

export function renderInlineComment(finding) {
  const sections = [
    renderBadges(finding),
    `**${singleLine(finding.title)}**`,
    finding.body.trim(),
    renderEvidence(finding),
    renderSuggestion(finding),
    renderDetails('🤖 Prompt for AI Agents', fence(`${AGENT_PROMPT_INTRO}\n\n${renderAgentPrompt(finding)}`)),
  ]

  return redactSecrets(sections.filter(Boolean).join(SECTION_SEPARATOR))
}

export function renderReviewBody({
  event,
  findings,
  isInlineInBody = false,
  output,
  passes,
  verification,
  coverage,
  context,
}) {
  const inline = capFindings(findings.inline, MAX_LIST_ENTRIES)
  const outside = capFindings(findings.outside, MAX_LIST_ENTRIES)
  const nits = capFindings(findings.nits, MAX_NITS)
  const inlineTitle = isInlineInBody ? 'Actionable comments' : 'Inline comments'

  const sections = [
    renderHeader(event, findings),
    renderPartialNote(coverage.notReviewed, passes),
    isInlineInBody && renderFindingsSection('💬 Actionable comments', inline, { open: true }),
    renderFindingsSection('⚠️ Outside diff range comments', outside, { open: outside.shown.some(isBlocking) }),
    renderFindingsSection('🧹 Nitpick comments', nits),
    renderPreviousFindings(output.overview?.previousFindings),
    renderAllAgentPrompts([
      { title: inlineTitle, findings: inline.shown },
      { title: 'Outside diff range comments', findings: outside.shown },
      { title: 'Nitpick comments', findings: nits.shown },
    ]),
    renderReviewInfo({ coverage, context, passes, verification }),
    REVIEW_FOOTER,
  ]

  return redactSecrets(fitSections(sections))
}

export function renderWalkthrough({ event, output, passes, coverage, context, ciStatus, reviewerLogin }) {
  const { overview, findings } = output
  const sections = [
    `${REVIEW_WALKTHROUGH_MARKER}\n## 📝 Walkthrough`,
    overview ? overview.walkthrough.trim() : `**${singleLine(context.trigger.title)}**\n\n${MISSING_OVERVIEW_NOTE}`,
    [
      `**Merge risk:** ${describeMergeRisk(findings, coverage.notReviewed, passes, event)}`,
      overview && `**Estimated review effort:** ${describeEffort(overview)}`,
    ]
      .filter(Boolean)
      .join('\n'),
    overview && renderChanges(overview.changes),
    overview && renderDiagram(overview.diagram),
    renderChecks({ findings, passes, ciStatus }),
    renderWalkthroughFooter(context.headSha, reviewerLogin),
  ]

  return redactSecrets(fitSections(sections))
}

function renderBadges(finding) {
  const severity = SEVERITIES[finding.severity]

  return `**${CATEGORY_LABELS[finding.category]}** | **${severity.icon} ${severity.label}**`
}

function renderEvidence(finding) {
  if (!finding.evidence?.trim()) return null

  return renderDetails('🔍 Why this was flagged', finding.evidence.trim())
}

function renderSuggestion(finding) {
  if (!hasSuggestion(finding)) return null
  if (!isSuggestionCommittable(finding)) return renderProposedFix(finding)

  const start = finding.anchorStartLine ?? finding.line
  const lines = start === finding.line ? `line ${finding.line}` : `lines ${start}–${finding.line}`
  const warning = `> ‼️ **IMPORTANT**\n> Review the suggestion before committing it: it replaces ${lines}.`

  return renderDetails('📝 Committable suggestion', `${warning}\n\n${fence(suggestionCode(finding), 'suggestion')}`)
}

function renderProposedFix(finding) {
  if (!hasSuggestion(finding)) return null

  return renderDetails('🛠️ Proposed fix', fence(suggestionCode(finding)))
}

function hasSuggestion(finding) {
  return typeof finding.suggestion === 'string' && finding.suggestion.trim() !== ''
}

function suggestionCode(finding) {
  return finding.suggestion.replace(TRAILING_NEWLINES, '')
}

function isSuggestionCommittable(finding) {
  if (finding.anchorStartLine !== null) return true

  return !Number.isInteger(finding.startLine) || finding.startLine === finding.line
}

function renderAgentPrompt(finding) {
  const lines = describeLines(finding)
  const location = lines ? `In @${finding.path} ${lines}` : `In @${finding.path}`

  return `${location}: ${finding.fixPrompt.trim()}`
}

function describeLines(finding) {
  if (!Number.isInteger(finding.line)) return null

  const { start, end } = lineRange(finding)

  return start === end ? `at line ${end}` : `around lines ${start} - ${end}`
}

function lineRange({ startLine, line }) {
  return { start: Number.isInteger(startLine) && startLine < line ? startLine : line, end: line }
}

function renderHeader(event, { inline, outside }) {
  if (event === 'APPROVE') return '✅ **Approved**: trivial change, safe to merge'

  const actionable = [...inline, ...outside]
  const rollup = REVIEW_SEVERITIES.map(severity => [severity, actionable.filter(f => f.severity === severity).length])
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${SEVERITIES[severity].icon} ${count} ${severity}`)

  return [`**Actionable comments posted: ${inline.length}**`, ...rollup].join(' · ')
}

function renderPartialNote(notReviewed, passes) {
  const gaps = [
    notReviewed.length > 0 && `${notReviewed.length} file(s) were not reviewed (listed under Review info)`,
    describeFailedFinders(passes),
  ].filter(Boolean)
  if (gaps.length === 0) return null

  return `> ⚠️ **Partial review**: ${gaps.join(' and ')}. A human needs to check what was not covered.`
}

function describeFailedFinders(passes) {
  const failed = groupByLens(passes.filter(pass => pass.lens !== REVIEW_OVERVIEW_PASS))
    .map(([lens, runs]) => ({ lens, total: runs.length, failed: runs.filter(isFailedPass).length }))
    .filter(group => group.failed > 0)
    .map(group => (group.total > 1 ? `${group.lens} (${group.failed} of ${group.total} shards)` : group.lens))
  if (failed.length === 0) return null

  return `the ${joinWithAnd(failed)} ${failed.length === 1 ? 'pass' : 'passes'} failed`
}

function capFindings(findings, limit) {
  return { total: findings.length, shown: sortBySeverity(findings).slice(0, limit) }
}

function renderFindingsSection(title, { total, shown }, { open = false } = {}) {
  if (total === 0) return null

  const groups = groupByPath(shown).map(([path, group]) =>
    renderDetails(`${path} (${group.length})`, group.map(renderEntry).join('\n\n---\n\n'), { quoted: true })
  )
  const content = [...groups, renderMore(total, shown.length)].filter(Boolean).join(SECTION_SEPARATOR)

  return renderDetails(`${title} (${total})`, content, { open, quoted: true })
}

function renderEntry(finding) {
  const location = Number.isInteger(finding.line) ? `\`${formatRange(lineRange(finding))}\`: ` : ''
  const sections = [
    `${location}${renderBadges(finding)}`,
    `**${singleLine(finding.title)}**`,
    finding.body.trim(),
    renderEvidence(finding),
    renderProposedFix(finding),
  ]

  return sections.filter(Boolean).join(SECTION_SEPARATOR)
}

function formatRange({ start, end }) {
  return start === end ? `${end}` : `${start}-${end}`
}

function renderMore(total, shownCount) {
  if (total <= shownCount) return null

  return `…and ${total - shownCount} more`
}

function renderPreviousFindings(previousFindings) {
  if (!previousFindings?.trim()) return null

  return renderDetails('♻️ Since the last review', previousFindings.trim())
}

function renderAllAgentPrompts(groups) {
  const blocks = groups.filter(group => group.findings.length > 0).map(renderAgentPromptGroup)
  if (blocks.length === 0) return null

  const text = [ALL_AGENT_PROMPTS_INTRO, ...blocks].join(SECTION_SEPARATOR)

  return renderDetails('🤖 Prompt for all review comments with AI agents', fence(text))
}

function renderAgentPromptGroup({ title, findings }) {
  const files = groupByPath(findings).map(([path, group]) => {
    const items = group.map(finding => `- ${renderAgentPromptItem(finding)}`)
    return [`In @${path}:`, ...items].join('\n')
  })

  return `${title}:\n${files.join(SECTION_SEPARATOR)}`
}

function renderAgentPromptItem(finding) {
  const lines = describeLines(finding)
  const prompt = finding.fixPrompt.trim().replace(LINE_BREAK, '\n  ')
  if (!lines) return prompt

  return `${lines.charAt(0).toUpperCase()}${lines.slice(1)}: ${prompt}`
}

function renderReviewInfo({ coverage, context, passes, verification }) {
  const { trigger, history, headSha, standards, spec } = context
  const base = trigger.baseSha ? shortSha(trigger.baseSha) : trigger.baseRef
  const standardsPaths = [...standards.documents, ...standards.notInlined].map(document => codeSpan(document.path))
  const storyIds = specStoryIds(spec)
  const { reviewed, skipped } = splitCoverage(coverage)

  const facts = [
    `- **Commits:** \`${base}..${shortSha(headSha)}\`${describeReReview(history)}`,
    `- **Trigger:** ${TRIGGER_LABELS[trigger.kind] ?? DEFAULT_TRIGGER_LABEL}`,
    `- **Standards:** ${standardsPaths.length > 0 ? standardsPaths.join(', ') : 'none found'}`,
    `- **Spec:** ${storyIds.length > 0 ? storyIds.map(id => `sc-${id}`).join(', ') : 'none'}`,
    `- **Passes:** ${describePasses(passes)}`,
    `- **Verification:** ${describeVerification(verification)}`,
  ]
  const fileLists = [
    renderFileList('📒 Files reviewed', reviewed.map(describeFile)),
    renderFileList('⏭️ Files skipped', skipped.map(describeFile)),
    renderFileList('⚠️ Files not reviewed', coverage.notReviewed.map(codeSpan)),
  ]

  return renderDetails('ℹ️ Review info', [facts.join('\n'), ...fileLists].filter(Boolean).join(SECTION_SEPARATOR))
}

function describePasses(passes) {
  return groupByLens(passes)
    .map(([lens, runs]) => {
      const name = runs.length > 1 ? `${lens} ×${runs.length}` : lens
      const failed = runs.filter(isFailedPass).length
      if (failed === 0) return name

      return runs.length > 1 ? `${name} (❌ ${failed} failed)` : `${name} (❌ failed)`
    })
    .join(', ')
}

function describeVerification({ proposed, confirmed, downgraded, dropped, unverified }) {
  const counts = [
    `${proposed} proposed`,
    `${confirmed} confirmed`,
    `${downgraded} downgraded`,
    `${dropped} dropped`,
    unverified > 0 && `${unverified} unverified`,
  ]

  return counts.filter(Boolean).join(' · ')
}

function specStoryIds(spec) {
  return spec.stories.map(story => story.id)
}

function splitCoverage({ files, reviewedPaths, notReviewed }) {
  const notReviewedSet = new Set(notReviewed)
  const skipped = files.filter(file => (file.generated || file.empty) && !reviewedPaths.has(file.filename))
  const skippedSet = new Set(skipped.map(file => file.filename))
  const reviewed = files.filter(file => !notReviewedSet.has(file.filename) && !skippedSet.has(file.filename))

  return { reviewed, skipped }
}

function describeFile(file) {
  if (file.generated) return `${codeSpan(file.filename)} (generated)`
  if (file.empty) return `${codeSpan(file.filename)} (empty)`

  return codeSpan(file.filename)
}

function codeSpan(text) {
  return `\`${text}\``
}

function describeReReview(history) {
  if (!history?.changes) return ''
  if (history.changes.status === 'incremental') return ` (re-review since \`${shortSha(history.lastReviewedSha)}\`)`

  return ' (re-review of the full diff)'
}

function renderFileList(title, entries) {
  if (entries.length === 0) return null

  const shown = entries.slice(0, MAX_LIST_ENTRIES)
  const lines = [...shown.map(entry => `- ${entry}`), renderMore(entries.length, shown.length)].filter(Boolean)

  return renderDetails(`${title} (${entries.length})`, lines.join('\n'))
}

function describeMergeRisk(findings, notReviewed, passes, event) {
  const [mostSevere] = sortBySeverity(findings)
  const failedFinders = describeFailedFinders(passes)

  if (mostSevere?.severity === 'critical') return `🔴 High · ${singleLine(mostSevere.title)}`
  if (mostSevere?.severity === 'major') return `🟠 Medium · ${singleLine(mostSevere.title)}`
  if (notReviewed.length > 0) return `⚪ Unknown · ${notReviewed.length} file(s) not reviewed`
  if (failedFinders) return `⚪ Unknown · ${failedFinders}`
  if (event === 'APPROVE') return '🟢 Low · trivial change, approved'

  return '🟢 Low · no blocking issues found'
}

function describeEffort({ effort, reviewMinutes }) {
  const level = Math.min(EFFORT_LABELS.length, Math.max(1, effort))

  return `🎯 ${level} (${EFFORT_LABELS[level - 1]}) · ⏱️ ~${Math.max(1, reviewMinutes)} minutes`
}

function renderChanges(changes) {
  if (changes.length === 0) return null

  const rows = changes.map(change => {
    const files = renderCohortFiles(change.files)
    const cohort = [`**${tableCell(change.label)}**`, files].filter(Boolean).join('<br>')
    return `| ${cohort} | ${tableCell(change.summary)} |`
  })

  return renderDetails('📂 Changes', ['| Cohort / File(s) | Summary |', '| :--- | :--- |', ...rows].join('\n'))
}

function renderCohortFiles(files) {
  const shown = files.slice(0, MAX_LIST_ENTRIES)

  return [...shown.map(file => codeSpan(tableCell(file))), renderMore(files.length, shown.length)]
    .filter(Boolean)
    .join(', ')
}

function renderDiagram(diagram) {
  if (!diagram?.trim()) return null

  return renderDetails('📊 Sequence diagram', fence(diagram.trim(), 'mermaid'))
}

function renderChecks({ findings, passes, ciStatus }) {
  const checks = [
    { name: 'Standards', ...describeLensCheck({ findings, passes }, 'standards', NO_STANDARDS_DETAILS) },
    { name: 'Spec', ...describeLensCheck({ findings, passes }, 'spec', NO_SPEC_DETAILS) },
    { name: 'CI', ...describeCi(ciStatus) },
  ]
  const tally = Object.entries(CHECK_STATUSES)
    .map(([status, { icon }]) => [icon, checks.filter(check => check.status === status).length])
    .filter(([, count]) => count > 0)
    .map(([icon, count]) => `${icon} ${count}`)
  const rows = checks.map(check => {
    const status = CHECK_STATUSES[check.status]
    return `| ${check.name} | ${status.icon} ${status.label} | ${tableCell(check.details)} |`
  })

  return renderDetails(
    ['🚥 Checks', ...tally].join(' · '),
    ['| Check | Status | Details |', '| :--- | :--- | :--- |', ...rows].join('\n')
  )
}

function describeLensCheck({ findings, passes }, lens, skippedDetails) {
  const pass = passes.find(candidate => candidate.lens === lens)

  if (!pass) return { status: 'skipped', details: skippedDetails }
  if (isFailedPass(pass)) return { status: 'warning', details: `The ${lens} pass did not complete` }

  return { status: hasCategory(findings, lens) ? 'warning' : 'passed', details: pass.note }
}

function hasCategory(findings, category) {
  return findings.some(finding => finding.category === category)
}

function describeCi(ciStatus) {
  if (!ciStatus) return { status: 'skipped', details: 'The CI status could not be loaded' }
  if (ciStatus.checks.length === 0) return { status: 'skipped', details: 'No checks reported' }

  const failed = ciStatus.checks.filter(check => check.state === CI_FAILED)
  if (failed.length > 0) return { status: 'failed', details: `${failed.length} failed: ${listCheckNames(failed)}` }

  const pending = ciStatus.checks.filter(check => check.state === CI_PENDING)
  if (pending.length > 0) return { status: 'pending', details: `${pending.length} pending: ${listCheckNames(pending)}` }

  return { status: 'passed', details: `${ciStatus.checks.length} passed` }
}

function listCheckNames(checks) {
  const names = checks.slice(0, MAX_CI_NAMES).map(check => singleLine(check.name))

  return checks.length > MAX_CI_NAMES ? `${names.join(', ')}, …` : names.join(', ')
}

function renderWalkthroughFooter(headSha, reviewerLogin) {
  const parts = [`Last reviewed commit: \`${shortSha(headSha)}\``, 'updated on every review']
  if (reviewerLogin) parts.push(`comment \`@${reviewerLogin} review\` to request a new one`)

  return `<sub>${parts.join(' · ')}</sub>`
}

function renderDetails(summary, content, { open = false, quoted = false } = {}) {
  const tag = open ? '<details open>' : '<details>'
  if (quoted) return `${tag}\n<summary>${summary}</summary><blockquote>\n\n${content}\n\n</blockquote></details>`

  return `${tag}\n<summary>${summary}</summary>\n\n${content}\n\n</details>`
}

function fence(content, info = '') {
  const longestRun = Math.max(0, ...(content.match(BACKTICK_RUN) ?? []).map(run => run.length))
  const marker = '`'.repeat(Math.max(MIN_FENCE_LENGTH, longestRun + 1))

  return `${marker}${info}\n${content}\n${marker}`
}

function fitSections(sections) {
  const present = sections.filter(Boolean)
  const [head, tail] = [present[0], present.at(-1)]
  const middle = present.slice(1, -1)
  const kept = []
  let budget = MAX_POST_CHARS - head.length - tail.length - TRUNCATION_NOTE.length - 3 * SECTION_SEPARATOR.length

  for (const section of middle) {
    const cost = section.length + SECTION_SEPARATOR.length
    if (cost > budget) continue

    kept.push(section)
    budget -= cost
  }

  const note = kept.length < middle.length ? [TRUNCATION_NOTE] : []

  return [head, ...kept, ...note, tail].join(SECTION_SEPARATOR)
}

function sortBySeverity(findings) {
  return [...findings].sort((a, b) => REVIEW_SEVERITIES.indexOf(a.severity) - REVIEW_SEVERITIES.indexOf(b.severity))
}

function isBlocking(finding) {
  return REVIEW_BLOCKING_SEVERITIES.has(finding.severity)
}

function isFailedPass(pass) {
  return pass.status === REVIEW_PASS_FAILED
}

function joinWithAnd(items) {
  if (items.length === 1) return items[0]

  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function groupByPath(findings) {
  return groupBy(findings, finding => finding.path)
}

function groupByLens(passes) {
  return groupBy(passes, pass => pass.lens)
}

function groupBy(items, keyOf) {
  const groups = new Map()
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item])

  return [...groups]
}

function singleLine(text) {
  return String(text ?? '')
    .replace(WHITESPACE_RUN, ' ')
    .trim()
}

function tableCell(text) {
  return String(text ?? '')
    .trim()
    .replace(TABLE_SPECIAL_CHARACTER, '\\$&')
    .replace(LINE_BREAK, '<br>')
}
