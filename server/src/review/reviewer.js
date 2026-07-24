import { stat } from 'node:fs/promises'
import path from 'node:path'
import config from '../config.js'
import { findFiles, findFilesAt } from '../repo-pool/index.js'
import { acquireWorkspace } from './workspace.js'
import * as shortcut from '../shortcut/client.js'
import {
  getPullRequest,
  listPullRequestFiles,
  createPullRequestReview,
  createIssueComment,
  createIssueReaction,
  deleteIssueReaction,
} from '../github/client.js'
import { selectFilesWithinBudget, partitionFindings } from './diff.js'
import { runReviewerAgent } from './agent.js'
import { redactSecrets } from './output-guard.js'

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

export async function runReview(trigger, { logger = console } = {}) {
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
      title: pr.title ?? trigger.title,
      body: pr.body ?? '',
      draft: Boolean(pr.draft),
      authorLogin: pr.user?.login ?? trigger.authorLogin,
      changedLines: (pr.additions ?? 0) + (pr.deletions ?? 0),
    }
    reviewedSha = current.headSha
    if (current.headSha !== headSha) {
      logger.log(
        `[review] Head moved ${headSha.slice(0, 7)} → ${current.headSha.slice(0, 7)} on ${dedupeKey}; reviewing the current head`
      )
    }

    workspace = await acquireWorkspace(repoFullName, prNumber, logger)
    const rootPath = workspace?.localPath ?? null

    const [files, standardsFiles] = await Promise.all([
      listPullRequestFiles(repoFullName, prNumber),
      discoverStandardsFiles(repoFullName, rootPath, logger),
    ])

    const latest = await getPullRequest(repoFullName, prNumber).catch(() => null)
    if (latest?.head?.sha && latest.head.sha !== reviewedSha) {
      logger.log(`[review] Head moved to ${latest.head.sha.slice(0, 7)} during file fetch on ${dedupeKey}`)
      reviewedSha = latest.head.sha
    }

    const emptyFilenames = await findEmptyFiles(files, rootPath)
    const { included, omitted, empty } = selectFilesWithinBudget(files, config.review.maxChangedLines, {
      emptyFilenames,
    })

    const storyId = (await shortcut.isConfigured()) ? extractStoryId(current) : null

    const output = await runReviewerAgent({
      trigger: { ...current, headSha: reviewedSha },
      files: included,
      omitted,
      empty,
      standardsFiles,
      storyId,
      rootPath,
    })

    const { anchored, unanchored } = partitionFindings(output.findings, included)
    const event = resolveEvent(output, omitted)
    const comments = anchored.map(f => ({
      path: f.path,
      line: f.line,
      side: 'RIGHT',
      body: redactSecrets(formatFinding(f, { withLocation: false })),
    }))

    try {
      await createPullRequestReview(repoFullName, prNumber, {
        commitId: reviewedSha,
        body: buildReviewBody({ output, leftoverFindings: unanchored, omitted, trigger: current, event }),
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
          omitted,
          trigger: current,
          event,
        }),
        event,
      })
    }

    logger.log(`[review] Done ${dedupeKey}: ${event}, ${output.findings.length} finding(s)`)
  } catch (err) {
    logger.error(`[review] Failed ${dedupeKey}:`, err)
    try {
      await createIssueComment(
        repoFullName,
        prNumber,
        `⚠️ Soporti could not complete the review of this PR (commit \`${reviewedSha.slice(0, 7)}\`). ` +
          'Re-request the review (or re-add the label) to retry.'
      )
    } catch (commentErr) {
      logger.error(`[review] Could not post the failure comment for ${dedupeKey}:`, commentErr)
    }
  } finally {
    await removeEyes(repoFullName, prNumber, eyesId, logger)
    await workspace?.release()
  }
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

function resolveEvent(output, omitted = []) {
  const hasBlocking = output.findings.some(f => f.severity === 'critical' || f.severity === 'major')
  return output.verdict === 'approve' && !hasBlocking && omitted.length === 0 ? 'APPROVE' : 'COMMENT'
}

function formatFinding(finding, { withLocation = true } = {}) {
  const axis = finding.axis && finding.axis !== 'correctness' ? ` · ${finding.axis}` : ''
  const location = withLocation ? `\`${finding.path}${finding.line ? `:${finding.line}` : ''}\` — ` : ''
  return `**[${finding.severity}${axis}]** ${location}${finding.body}`
}

function buildVerdictHeader({ event, findings, omitted }) {
  const counts = { critical: 0, major: 0, minor: 0, nit: 0 }
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1
  const rollup = ['critical', 'major', 'minor', 'nit']
    .filter(severity => counts[severity] > 0)
    .map(severity => `${counts[severity]} ${severity}`)
    .join(' · ')
  const hasBlocking = counts.critical + counts.major > 0
  const partial = omitted.length > 0
  const notReviewed = ' · some files not reviewed (see below)'

  if (event === 'APPROVE') {
    return '### ✅ **Approved** — trivial change, safe to merge'
  }
  if (hasBlocking) {
    return `### 🔎 **Review needed** — ${rollup} worth a look before merging${partial ? notReviewed : ''}`
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

function buildReviewBody({ output, leftoverFindings, omitted, trigger, event }) {
  const parts = [buildVerdictHeader({ event, findings: output.findings, omitted }), output.summary]

  if (leftoverFindings.length > 0) {
    parts.push(`---\n\n**Findings**\n\n${leftoverFindings.map(f => `- ${formatFinding(f)}`).join('\n')}`)
  }

  if (omitted.length > 0) {
    const list = omitted.map(o => `\`${o.filename}\``).join(', ')
    parts.push(
      `> ⚠️ Not reviewed (${omitted.map(o => o.reason).includes('budget') ? 'diff budget' : 'no patch'}): ${list}`
    )
  }

  parts.push(
    `---\n_Automated review by Soporti · trigger: ${trigger.kind === 'labeled' ? 'label' : 'review request'}._`
  )

  return redactSecrets(parts.join('\n\n'))
}
