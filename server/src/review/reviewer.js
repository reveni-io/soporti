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

// Where repos document how their code should be written. ADRs count: an
// architectural decision is a standard. Same list the review skill uses.
const STANDARDS_PATTERNS = [
  'CLAUDE.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CONTEXT.md',
  'STYLE.md',
  'STANDARDS.md',
  'STYLEGUIDE.md',
  'docs/adr/*.md',
  // Agent skills are procedural standards: they document how a kind of work
  // (migrations, prod queries…) must be done in this repo.
  '.claude/skills/*.md',
  '.agents/skills/*.md',
]
const MAX_STANDARDS_FILES = 30

// Shortcut story references look like sc-1234, in branch names, titles or bodies.
const STORY_REF = /\bsc-?(\d+)\b/i

// Runs one PR review job end to end. Never throws: every failure path either
// degrades (no clone, body-only review) or surfaces as a comment on the PR —
// someone explicitly asked for this review, silence would be worse.
export async function runReview(trigger, { logger = console } = {}) {
  const { repoFullName, prNumber, headSha, dedupeKey } = trigger
  logger.log(`[review] Reviewing ${dedupeKey} (${trigger.kind})`)

  let workspace = null
  // The commit the review anchors to and the one named in any failure comment.
  // Starts at the trigger's sha and tracks the freshest head we observe.
  let reviewedSha = headSha

  // 👀 on the PR says "Soporti is on it" the moment the job starts; the
  // finally takes it off, so its absence means the review is no longer running.
  const eyesId = await addEyes(repoFullName, prNumber, logger)

  try {
    // Commits may land (or the PR may close) between the gesture and this run.
    // Review the PR as it is NOW and anchor to its current head — mixing the
    // current diff with the trigger's stale sha gets the review rejected.
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

    // Pin a checkout for the agent's repo tools, best first: the PR head in
    // an ephemeral worktree (the code WITH the PR applied), else the pool's
    // default-branch clone, else nothing — the diff alone still stands.
    workspace = await acquireWorkspace(repoFullName, prNumber, logger)
    const rootPath = workspace?.localPath ?? null

    const [files, standardsFiles] = await Promise.all([
      listPullRequestFiles(repoFullName, prNumber),
      discoverStandardsFiles(repoFullName, rootPath, logger),
    ])

    // GitHub serves the file list against its head AT REQUEST TIME, with no way
    // to pin it to a sha. If a push landed during setup, anchor the review to
    // the freshest head so commitId matches the diff we just fetched; a push
    // during this last window still degrades to the body-only retry below.
    const latest = await getPullRequest(repoFullName, prNumber).catch(() => null)
    if (latest?.head?.sha && latest.head.sha !== reviewedSha) {
      logger.log(`[review] Head moved to ${latest.head.sha.slice(0, 7)} during file fetch on ${dedupeKey}`)
      reviewedSha = latest.head.sha
    }

    const emptyFilenames = await findEmptyFiles(files, rootPath)
    const { included, omitted, empty } = selectFilesWithinBudget(files, config.review.maxChangedLines, {
      emptyFilenames,
    })

    // Hybrid spec axis: the server only detects the story reference; the
    // agent fetches the story itself through its Shortcut tools.
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
      // 422 is GitHub rejecting the whole review because an inline comment
      // failed to anchor — retry once with everything folded into the body.
      // Any other error (5xx, timeout, auth) is a real failure: rethrow so it
      // surfaces as a failure comment instead of risking a duplicate review.
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

// The reaction is a courtesy signal: failing to add or remove it never
// touches the review itself.
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

// GitHub's file list cannot tell an empty file from a binary one: both come
// back with no patch and 0 changed lines. The PR-head worktree can — an empty
// file is 0 bytes on disk. Only verified-empty files escape the "not reviewed"
// treatment; no worktree, a deleted file, or any stat failure means we cannot
// vouch for it and it stays omitted. Filenames are author-controlled, so the
// resolved path must stay inside the checkout.
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
      } catch {
        // Unreadable or missing: cannot vouch for it, keep it omitted.
      }
    })
  )

  return empty
}

// The standards axis only works if the agent knows where the standards live;
// failures here degrade the review, never block it. Discovery prefers the
// review's checkout (a PR may add or change standards docs).
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

// The spec axis sources the originating Shortcut story when one is referenced
// from the branch name, the PR title or the body. No reference, no spec — the
// agent is told to skip that axis.
function extractStoryId({ headRef, title, body }) {
  for (const source of [headRef, title, body]) {
    const match = typeof source === 'string' ? source.match(STORY_REF) : null
    if (match) return parseInt(match[1], 10)
  }
  return null
}

// APPROVE is reserved for Trivial PRs; a blocking finding
// contradicts the agent's own approval, and an approval cannot vouch for files
// that were left out of the review — in both cases the safe verdict wins.
function resolveEvent(output, omitted = []) {
  const hasBlocking = output.findings.some(f => f.severity === 'critical' || f.severity === 'major')
  return output.verdict === 'approve' && !hasBlocking && omitted.length === 0 ? 'APPROVE' : 'COMMENT'
}

function formatFinding(finding, { withLocation = true } = {}) {
  const axis = finding.axis && finding.axis !== 'correctness' ? ` · ${finding.axis}` : ''
  const location = withLocation ? `\`${finding.path}${finding.line ? `:${finding.line}` : ''}\` — ` : ''
  return `**[${finding.severity}${axis}]** ${location}${finding.body}`
}

// A deterministic verdict line at the very top of every review. Soporti's
// COMMENT reviews never turn the GitHub review badge green — it stays neutral
// by design (consultative, never blocks), which on its own reads as
// "did it even finish?". This line states the bottom line at a glance. It is
// computed from the GitHub event we actually emit (never the model's intent),
// so it can never contradict the review state; severity words stay English to
// match the inline finding tags.
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
    // APPROVE implies no omitted files (resolveEvent), so it is never partial.
    return '### ✅ **Approved** — trivial change, safe to merge'
  }
  if (hasBlocking) {
    return `### 🔎 **Review needed** — ${rollup} worth a look before merging${partial ? notReviewed : ''}`
  }
  // A partial review cannot vouch for the whole PR, so it must never read as a
  // clean LGTM even when the reviewed subset had no blocking findings — the
  // trailing marker is too easy to miss next to a green-looking verdict.
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

  // Everything published on GitHub goes through the output guard: the agent
  // reads attacker-writable input and prod data.
  return redactSecrets(parts.join('\n\n'))
}
