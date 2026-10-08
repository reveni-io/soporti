import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { findFiles, findFilesAt } from '../repo-pool/index.js'
import { acquireWorkspace } from './workspace.js'
import * as shortcut from '../shortcut/client.js'
import {
  getPullRequest,
  listPullRequestFiles,
  compareCommits,
  createPullRequestReview,
  createIssueComment,
  createIssueReaction,
  deleteIssueReaction,
} from '../github/client.js'
import { partitionFindings, buildGeneratedMatcher, classifyFiles, findUnreviewedFiles } from './diff.js'
import { runReviewerAgent } from './agent.js'
import { verifyFindings } from './verify.js'
import { loadReviewHistory } from './history.js'
import { loadCiStatus } from './ci-status.js'
import { redactSecrets } from './output-guard.js'
import { shortSha } from '../github/sanitize.js'
import {
  PR_HEAD_PLACEHOLDER,
  REVIEW_KIND_MENTION_COMMAND,
  REVIEW_KIND_SYNCHRONIZE,
  REVIEW_TURN_LIMIT_ERROR,
} from '../constants.js'

const STANDARDS_PATTERNS = [
  'CLAUDE.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CONTEXT.md',
  'STYLE.md',
  'STANDARDS.md',
  'STYLEGUIDE.md',
  'docs/adr/*.md',
  '.claude/skills/*.md',
  '.agents/skills/*.md',
]
const MAX_STANDARDS_FILES = 30

const STORY_REF = /\bsc-?(\d+)\b/i

const TRIGGER_LABELS = { labeled: 'label', [REVIEW_KIND_MENTION_COMMAND]: 'mention', [REVIEW_KIND_SYNCHRONIZE]: 'push' }
const DEFAULT_TRIGGER_LABEL = 'review request'

export async function runReview(trigger, { logger = console, reviewerLogin = null, signal } = {}) {
  const { repoFullName, prNumber, headSha, dedupeKey } = trigger
  logger.log(`[review] Reviewing ${dedupeKey} (${trigger.kind})`)

  let workspace = null
  let reviewedSha = headSha

  const eyesId = await addEyes(repoFullName, prNumber, logger)

  try {
    const pr = await getPullRequest(repoFullName, prNumber)
    if (pr.state !== 'open') {
      logger.log(`[review] Skipping ${dedupeKey}: PR is ${pr.state}`)
      return
    }

    const current = {
      ...trigger,
      headSha: pr.head?.sha ?? headSha,
      headRef: pr.head?.ref ?? '',
      baseRef: pr.base?.ref ?? trigger.baseRef,
      baseSha: pr.base?.sha ?? null,
      title: pr.title ?? trigger.title,
      body: pr.body ?? '',
      draft: Boolean(pr.draft),
      authorLogin: pr.user?.login ?? trigger.authorLogin,
      changedLines: (pr.additions ?? 0) + (pr.deletions ?? 0),
    }
    reviewedSha = current.headSha
    if (headSha !== PR_HEAD_PLACEHOLDER && current.headSha !== headSha) {
      logger.log(
        `[review] Head moved ${shortSha(headSha)} → ${shortSha(current.headSha)} on ${dedupeKey}; reviewing the current head`
      )
    }

    workspace = await acquireWorkspace(repoFullName, prNumber, logger)
    const rootPath = workspace?.localPath ?? null

    const [files, standardsFiles, gitattributes] = await Promise.all([
      listPullRequestFiles(repoFullName, prNumber),
      discoverStandardsFiles(repoFullName, rootPath, logger),
      readGitattributes(rootPath),
    ])

    const latest = await getPullRequest(repoFullName, prNumber).catch(() => null)
    if (latest?.head?.sha && latest.head.sha !== reviewedSha) {
      logger.log(`[review] Head moved to ${shortSha(latest.head.sha)} during file fetch on ${dedupeKey}`)
      reviewedSha = latest.head.sha
    }

    const emptyFilenames = await findEmptyFiles(files, rootPath)
    const changedFiles = classifyFiles(files, { emptyFilenames, isGenerated: buildGeneratedMatcher(gitattributes) })

    const storyId = (await shortcut.isConfigured()) ? extractStoryId(current) : null
    const [history, ciStatus] = await Promise.all([
      loadReviewHistory({ repoFullName, prNumber, headSha: reviewedSha, reviewerLogin, files }, { logger }),
      loadCiStatus({ repoFullName, headSha: reviewedSha }, { logger }),
    ])
    const diffBaseSha = await resolveDiffBase(
      { workspace, files: changedFiles, repoFullName, base: current.baseSha ?? current.baseRef, headSha: reviewedSha },
      logger
    )

    signal?.throwIfAborted()

    const { output: proposed, reviewedPaths } = await runReviewerAgent({
      trigger: { ...current, headSha: reviewedSha },
      files: changedFiles,
      standardsFiles,
      storyId,
      history,
      ciStatus,
      rootPath,
      diffBaseSha,
      signal,
    })

    signal?.throwIfAborted()

    const findings = await verifyFindings(proposed.findings, {
      trigger: { ...current, headSha: reviewedSha },
      files: changedFiles,
      rootPath,
      diffBaseSha,
      signal,
      logger,
    })
    const output = { ...proposed, findings }

    signal?.throwIfAborted()

    const notReviewed = findUnreviewedFiles(changedFiles, reviewedPaths)
    const { anchored, unanchored } = partitionFindings(output.findings, files)
    const event = resolveEvent(proposed, notReviewed)
    const comments = anchored.map(f => ({
      path: f.path,
      line: f.line,
      side: 'RIGHT',
      body: redactSecrets(formatFinding(f, { withLocation: false })),
    }))

    try {
      await createPullRequestReview(repoFullName, prNumber, {
        commitId: reviewedSha,
        body: buildReviewBody({ output, leftoverFindings: unanchored, notReviewed, trigger: current, event, history }),
        event,
        comments,
      })
    } catch (err) {
      if (err.status !== 422) throw err
      logger.warn(`[review] Inline review rejected for ${dedupeKey} (${err.message}); retrying body-only`)
      await createPullRequestReview(repoFullName, prNumber, {
        commitId: reviewedSha,
        body: buildReviewBody({
          output,
          leftoverFindings: [...anchored, ...unanchored],
          notReviewed,
          trigger: current,
          event,
          history,
        }),
        event,
      })
    }

    logger.log(`[review] Done ${dedupeKey}: ${event}, ${output.findings.length} finding(s)`)
  } catch (err) {
    if (signal?.aborted) {
      logger.log(`[review] Superseded ${dedupeKey}: a newer review request replaced it; posting nothing`)
      return
    }

    const turnLimit = err.code === REVIEW_TURN_LIMIT_ERROR ? err.maxTurns : null
    const logCause = turnLimit ? ` hit the turn limit (${turnLimit} turns)` : ''
    logger.error(`[review] Failed ${dedupeKey}:${logCause}`, err)

    try {
      await createIssueComment(repoFullName, prNumber, buildFailureComment(reviewedSha, turnLimit))
    } catch (commentErr) {
      logger.error(`[review] Could not post the failure comment for ${dedupeKey}:`, commentErr)
    }
  } finally {
    await removeEyes(repoFullName, prNumber, eyesId, logger)
    await workspace?.release()
  }
}

function buildFailureComment(sha, turnLimit) {
  const cause = turnLimit
    ? ` It hit the turn limit (${turnLimit} turns): the PR may be too large for one review, \`REVIEW_MAX_TURNS\` can be raised.`
    : ''

  return `⚠️ Soporti could not complete the review of this PR (commit \`${shortSha(sha)}\`).${cause} Re-request the review (or re-add the label) to retry.`
}

async function addEyes(repoFullName, prNumber, logger) {
  try {
    const reaction = await createIssueReaction(repoFullName, prNumber, 'eyes')
    return reaction?.id ?? null
  } catch (err) {
    logger.warn(`[review] Could not add the eyes reaction on ${repoFullName}#${prNumber} (${err.message})`)
    return null
  }
}

async function removeEyes(repoFullName, prNumber, reactionId, logger) {
  if (!reactionId) return
  try {
    await deleteIssueReaction(repoFullName, prNumber, reactionId)
  } catch (err) {
    logger.warn(`[review] Could not remove the eyes reaction on ${repoFullName}#${prNumber} (${err.message})`)
  }
}

async function readGitattributes(rootPath) {
  if (!rootPath) return ''

  try {
    return await readFile(path.join(rootPath, '.gitattributes'), 'utf-8')
  } catch {
    return ''
  }
}

async function resolveDiffBase({ workspace, files, repoFullName, base, headSha }, logger) {
  if (!workspace?.isPrHead) return null
  if (!files.some(needsLocalDiff)) return null

  try {
    const { mergeBaseSha } = await compareCommits(repoFullName, base, headSha)
    return mergeBaseSha
  } catch (err) {
    logger.warn(
      `[review] Could not resolve the merge base of ${repoFullName}@${shortSha(headSha)} (${err.message}); files without a GitHub patch cannot be diffed`
    )
    return null
  }
}

function needsLocalDiff(file) {
  return typeof file.patch !== 'string' && !file.empty
}

async function findEmptyFiles(files, rootPath) {
  const empty = new Set()
  if (!rootPath) return empty

  const root = path.resolve(rootPath)
  const candidates = (files ?? []).filter(
    f =>
      f?.filename &&
      typeof f.patch !== 'string' &&
      (f.additions ?? 0) + (f.deletions ?? 0) === 0 &&
      f.status !== 'removed'
  )

  await Promise.all(
    candidates.map(async file => {
      const resolved = path.resolve(root, file.filename)
      if (!resolved.startsWith(root + path.sep)) return
      try {
        const stats = await stat(resolved)
        if (stats.isFile() && stats.size === 0) empty.add(file.filename)
      } catch {}
    })
  )

  return empty
}

async function discoverStandardsFiles(repoFullName, rootPath, logger) {
  const find = pattern =>
    rootPath ? findFilesAt(rootPath, pattern, { maxResults: 20 }) : findFiles(repoFullName, pattern, { maxResults: 20 })
  const results = await Promise.allSettled(STANDARDS_PATTERNS.map(find))

  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0) {
    logger.warn(
      `[review] Standards discovery incomplete for ${repoFullName} (${failures[0].reason?.message ?? 'unknown error'})`
    )
  }

  const paths = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value.items.map(item => item.path))
  return [...new Set(paths)].slice(0, MAX_STANDARDS_FILES)
}

function extractStoryId({ headRef, title, body }) {
  for (const source of [headRef, title, body]) {
    const match = typeof source === 'string' ? source.match(STORY_REF) : null
    if (match) return parseInt(match[1], 10)
  }
  return null
}

function resolveEvent(proposed, notReviewed) {
  const hasProposedBlocking = proposed.findings.some(f => f.severity === 'critical' || f.severity === 'major')
  return proposed.verdict === 'approve' && !hasProposedBlocking && notReviewed.length === 0 ? 'APPROVE' : 'COMMENT'
}

function formatFinding(finding, { withLocation = true } = {}) {
  const axis = finding.axis && finding.axis !== 'correctness' ? ` · ${finding.axis}` : ''
  const location = withLocation ? `\`${finding.path}${finding.line ? `:${finding.line}` : ''}\` — ` : ''
  return `**[${finding.severity}${axis}]** ${location}${finding.body}`
}

function buildVerdictHeader({ event, findings, notReviewed }) {
  const counts = { critical: 0, major: 0, minor: 0, nit: 0 }
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1
  const rollup = ['critical', 'major', 'minor', 'nit']
    .filter(severity => counts[severity] > 0)
    .map(severity => `${counts[severity]} ${severity}`)
    .join(' · ')
  const hasBlocking = counts.critical + counts.major > 0
  const partial = notReviewed.length > 0
  const notReviewedNote = ' · some files not reviewed (see below)'

  if (event === 'APPROVE') {
    return '### ✅ **Approved** — trivial change, safe to merge'
  }
  if (hasBlocking) {
    return `### 🔎 **Review needed** — ${rollup} worth a look before merging${partial ? notReviewedNote : ''}`
  }
  if (partial) {
    const found = rollup ? `${rollup} found; ` : ''
    return `### 🔎 **Partial review** — ${found}some files not reviewed (see below); a human needs to check the rest and approve`
  }
  if (rollup) {
    return `### 👍 **LGTM** — only ${rollup}; a human approval is still needed to merge`
  }
  return '### 👍 **LGTM** — no blocking issues; a human approval is still needed to merge'
}

function buildReviewBody({ output, leftoverFindings, notReviewed, trigger, event, history }) {
  const parts = [buildVerdictHeader({ event, findings: output.findings, notReviewed }), output.summary]

  if (leftoverFindings.length > 0) {
    parts.push(`---\n\n**Findings**\n\n${leftoverFindings.map(f => `- ${formatFinding(f)}`).join('\n')}`)
  }

  if (notReviewed.length > 0) {
    const list = notReviewed.map(filename => `\`${filename}\``).join(', ')
    parts.push(`> ⚠️ Not reviewed (not opened by the reviewer): ${list}`)
  }

  const triggerLabel = TRIGGER_LABELS[trigger.kind] ?? DEFAULT_TRIGGER_LABEL
  parts.push(`---\n_Automated review by Soporti · trigger: ${triggerLabel}${describeReReview(history)}._`)

  return redactSecrets(parts.join('\n\n'))
}

function describeReReview(history) {
  if (!history?.changes) return ''
  if (history.changes.status === 'incremental') return ` · re-review since \`${shortSha(history.lastReviewedSha)}\``
  return ' · re-review of the full diff'
}
