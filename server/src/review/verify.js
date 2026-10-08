import { z } from 'zod'
import config from '../config.js'
import { AGENT_CHANNEL_PR_REVIEW_VERIFY, REVIEW_SEVERITIES } from '../constants.js'
import { buildDiffTools, buildRepoTools, runReviewAgent } from './agent.js'
import { fenced, inline } from './context.js'
import { buildVerifierInstructions, buildVerifierTask } from './prompt.js'
import { mapWithConcurrency } from './concurrency.js'
import { redactSecrets } from './output-guard.js'

const VERIFIED_SEVERITIES = new Set(['critical', 'major', 'minor'])
const DROPPED_VERDICTS = new Set(['refuted', 'pre_existing'])
const DUPLICATE_VERDICT = 'duplicate'
const CONFIRMED = 'confirmed'
const DOWNGRADED = 'downgraded'
const DROPPED = 'dropped'
const UNVERIFIED = 'unverified'
const CLUSTER_LINE_GAP = 3
const MAX_VERIFIED_CLUSTERS = 30
const MAX_VERIFIER_TURNS = 15
const MAX_PARALLEL_VERIFICATIONS = 4
const VERIFICATION_TIMEOUT_MS = 5 * 60_000

const verificationSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(['confirmed', 'downgraded', 'refuted', 'pre_existing', 'duplicate']),
      severity: z.enum(REVIEW_SEVERITIES),
      duplicateOf: z.string().nullable(),
      suggestionValid: z.boolean(),
      evidence: z.string(),
    })
  ),
})

export async function verifyFindings(candidates, { logger = console, ...options }) {
  const scope = { ...options, logger }
  const nits = candidates.filter(finding => !VERIFIED_SEVERITIES.has(finding.severity))
  const entries = candidates
    .filter(finding => VERIFIED_SEVERITIES.has(finding.severity))
    .map((finding, index) => ({ id: `F${index + 1}`, finding }))
  const clusters = clusterEntries(entries).sort(compareClusters)
  const skipped = clusters.slice(MAX_VERIFIED_CLUSTERS).flat()

  if (skipped.length > 0) {
    logger.warn(
      `[review] Skipped the verification of ${describeEntries(skipped)}: over the limit of ${MAX_VERIFIED_CLUSTERS} clusters; posting them unverified`
    )
  }

  const verified = await mapWithConcurrency(
    clusters.slice(0, MAX_VERIFIED_CLUSTERS),
    MAX_PARALLEL_VERIFICATIONS,
    cluster => verifyCluster(cluster, scope)
  )
  const outcomes = [...verified.flat(), ...skipped.map(({ finding }) => ({ finding, outcome: UNVERIFIED }))]
  const countOutcome = outcome => outcomes.filter(result => result.outcome === outcome).length

  return {
    findings: [...outcomes.map(result => result.finding).filter(Boolean), ...nits],
    stats: {
      proposed: entries.length,
      confirmed: countOutcome(CONFIRMED),
      downgraded: countOutcome(DOWNGRADED),
      dropped: countOutcome(DROPPED),
      unverified: countOutcome(UNVERIFIED),
    },
  }
}

function clusterEntries(entries) {
  const byPath = new Map()
  for (const entry of entries) byPath.set(entry.finding.path, [...(byPath.get(entry.finding.path) ?? []), entry])

  return [...byPath.values()].flatMap(clusterPath)
}

function clusterPath(entries) {
  const unanchored = entries.filter(({ finding }) => !Number.isInteger(finding.line))
  const anchored = entries
    .filter(({ finding }) => Number.isInteger(finding.line))
    .sort((a, b) => lineRange(a.finding).start - lineRange(b.finding).start)
  const clusters = []
  let clusterEnd = null

  for (const entry of anchored) {
    const { start, end } = lineRange(entry.finding)
    if (clusterEnd === null || start - clusterEnd > CLUSTER_LINE_GAP) {
      clusters.push([entry])
      clusterEnd = end
      continue
    }

    clusters.at(-1).push(entry)
    clusterEnd = Math.max(clusterEnd, end)
  }

  return unanchored.length > 0 ? [unanchored, ...clusters] : clusters
}

function lineRange({ startLine, line }) {
  return { start: Number.isInteger(startLine) && startLine < line ? startLine : line, end: line }
}

function compareClusters(a, b) {
  return mostSevereRank(a) - mostSevereRank(b)
}

function mostSevereRank(cluster) {
  return Math.min(...cluster.map(({ finding }) => REVIEW_SEVERITIES.indexOf(finding.severity)))
}

async function verifyCluster(cluster, scope) {
  scope.signal?.throwIfAborted()

  try {
    const { verdicts } = await runVerifier(cluster, scope)
    return applyVerdicts(cluster, verdicts, scope.logger)
  } catch (err) {
    if (scope.signal?.aborted) throw err

    scope.logger.warn(
      `[review] Could not verify ${describeEntries(cluster)} (${err.message}); keeping ${cluster.length === 1 ? 'it' : 'them'} as proposed`
    )
    return cluster.map(({ finding }) => ({ finding, outcome: UNVERIFIED }))
  }
}

async function runVerifier(
  cluster,
  { trigger, files, sharedContext, changes = null, rootPath = null, diffBaseSha = null, signal }
) {
  const diff = buildDiffTools({ files, changes, rootPath, diffBaseSha })

  return runReviewAgent({
    name: 'Soporti Review Verifier',
    instructions: buildVerifierInstructions(trigger.repoFullName),
    tools: [...buildRepoTools(trigger.repoFullName, rootPath), ...diff.tools],
    outputType: verificationSchema,
    sharedContext,
    task: buildVerifierTask(cluster.map(renderEntry)),
    channel: AGENT_CHANNEL_PR_REVIEW_VERIFY,
    subject: `${trigger.repoFullName}#${trigger.prNumber}`,
    maxTurns: Math.min(MAX_VERIFIER_TURNS, config.review.maxTurns),
    signal: AbortSignal.any([signal, AbortSignal.timeout(VERIFICATION_TIMEOUT_MS)].filter(Boolean)),
  })
}

function renderEntry({ id, finding }) {
  const quoted = [`**${inline(finding.title)}**`, '', ...finding.body.split('\n')].map(line => `> ${line}`).join('\n')
  const facts = [
    `- Path: \`${inline(finding.path)}\``,
    `- Lines: ${describeLines(finding)}`,
    `- Severity: ${finding.severity}`,
    `- Category: ${finding.category}`,
  ]

  return [
    `### ${id} — proposed by the ${finding.lens} pass`,
    facts.join('\n'),
    `Title and body, as the finder wrote them:\n\n${quoted}`,
    renderSuggestion(finding),
  ].join('\n\n')
}

function describeLines(finding) {
  if (!Number.isInteger(finding.line)) return 'none (concerns something outside the diff)'

  const { start, end } = lineRange(finding)

  return start === end ? `${end}` : `${start}-${end}`
}

function renderSuggestion(finding) {
  if (typeof finding.suggestion !== 'string' || finding.suggestion.trim() === '') return 'Suggestion: none'

  return `Suggestion, replacing lines ${describeLines(finding)}:\n\n${fenced(finding.suggestion)}`
}

function applyVerdicts(cluster, verdicts, logger) {
  const verdictsById = new Map(verdicts.map(verdict => [verdict.id, verdict]))
  const clusterIds = new Set(cluster.map(({ id }) => id))
  const kept = new Map()

  for (const { id, finding } of cluster) {
    const verdict = verdictsById.get(id)
    if (!verdict) {
      kept.set(id, finding)
      continue
    }

    if (!DROPPED_VERDICTS.has(verdict.verdict)) kept.set(id, applyVerdict(finding, verdict))
  }

  for (const { id, finding } of cluster) {
    const verdict = verdictsById.get(id)
    const targetId = verdict?.verdict === DUPLICATE_VERDICT ? findDuplicateTarget(id, verdictsById, clusterIds) : null
    if (!targetId) continue

    kept.delete(id)
    const target = kept.get(targetId)
    if (target) kept.set(targetId, { ...target, severity: mergedSeverity(target, finding, verdict) })
  }

  return cluster.map(entry => describeOutcome(entry, verdictsById.get(entry.id), kept.get(entry.id) ?? null, logger))
}

function applyVerdict(finding, { verdict, severity, suggestionValid, evidence }) {
  const isDowngrade = verdict === DOWNGRADED && isLowerSeverity(severity, finding.severity)

  return {
    ...finding,
    severity: isDowngrade ? severity : finding.severity,
    suggestion: suggestionValid ? finding.suggestion : null,
    evidence: evidence.trim() || null,
  }
}

function findDuplicateTarget(id, verdictsById, clusterIds) {
  const visited = new Set([id])
  let current = verdictsById.get(id).duplicateOf

  while (clusterIds.has(current) && !visited.has(current)) {
    if (verdictsById.get(current)?.verdict !== DUPLICATE_VERDICT) return current

    visited.add(current)
    current = verdictsById.get(current).duplicateOf
  }

  return null
}

function mergedSeverity(target, duplicate, verdict) {
  const duplicateSeverity = isLowerSeverity(verdict.severity, duplicate.severity)
    ? verdict.severity
    : duplicate.severity

  return isLowerSeverity(duplicateSeverity, target.severity) ? target.severity : duplicateSeverity
}

function describeOutcome({ finding }, verdict, kept, logger) {
  const summary = describeFinding(finding)

  if (!verdict) {
    logger.warn(`[review] The verifier gave no verdict for ${summary}; keeping it as proposed`)
    return { finding, outcome: UNVERIFIED }
  }

  const why = redactSecrets(inline(verdict.evidence))

  if (!kept) {
    logger.log(`[review] Dropped ${summary}: ${verdict.verdict} (${why})`)
    return { finding: null, outcome: DROPPED }
  }

  if (!isLowerSeverity(kept.severity, finding.severity)) return { finding: kept, outcome: CONFIRMED }

  logger.log(`[review] Downgraded ${summary} to ${kept.severity} (${why})`)
  return { finding: kept, outcome: DOWNGRADED }
}

function isLowerSeverity(severity, than) {
  return REVIEW_SEVERITIES.indexOf(severity) > REVIEW_SEVERITIES.indexOf(than)
}

function describeEntries(entries) {
  return entries.map(({ finding }) => describeFinding(finding)).join(', ')
}

function describeFinding(finding) {
  return `the ${finding.severity} finding at ${inline(finding.path)}${finding.line ? `:${finding.line}` : ''}`
}
