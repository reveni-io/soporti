import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { gitDiffAt } from '../repo-pool/index.js'
import { acquireWorkspace } from './workspace.js'
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
import { buildSharedContext } from './context.js'
import { runReviewTeam } from './team.js'
import { verifyFindings } from './verify.js'
import { loadReviewHistory } from './history.js'
import { loadCiStatus } from './ci-status.js'
import { loadStandards } from './standards.js'
import { loadSpec } from './spec.js'
import { renderInlineComment, renderReviewBody, renderWalkthrough } from './render.js'
import { upsertWalkthrough } from './walkthrough.js'
import { resolveFixedThreads, selectFixedThreads } from './fixed-threads.js'
import { shortSha } from '../github/sanitize.js'
import {
  PR_HEAD_PLACEHOLDER,
  REVIEW_BLOCKING_SEVERITIES,
  REVIEW_PASS_FAILED,
  REVIEW_SEVERITIES,
  REVIEW_TURN_LIMIT_ERROR,
} from '../constants.js'

const NIT_SEVERITY = 'nit'
const MISSING_LINE = Number.MAX_SAFE_INTEGER

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

    const [files, gitattributes] = await Promise.all([
      listPullRequestFiles(repoFullName, prNumber),
      readGitattributes(rootPath),
    ])

    const latest = await getPullRequest(repoFullName, prNumber).catch(() => null)
    if (latest?.head?.sha && latest.head.sha !== reviewedSha) {
      logger.log(`[review] Head moved to ${shortSha(latest.head.sha)} during file fetch on ${dedupeKey}`)
      reviewedSha = latest.head.sha
    }

    const emptyFilenames = await findEmptyFiles(files, rootPath)
    const classifiedFiles = classifyFiles(files, { emptyFilenames, isGenerated: buildGeneratedMatcher(gitattributes) })

    const [history, ciStatus, standards, spec] = await Promise.all([
      loadReviewHistory({ repoFullName, prNumber, headSha: reviewedSha, reviewerLogin, files }, { logger }),
      loadCiStatus({ repoFullName, headSha: reviewedSha }, { logger }),
      loadStandards({ repoFullName, rootPath, files }, { logger }),
      loadSpec(current, { logger }),
    ])
    const diffBaseSha = await resolveDiffBase(
      {
        workspace,
        files: classifiedFiles,
        repoFullName,
        base: current.baseSha ?? current.baseRef,
        headSha: reviewedSha,
      },
      logger
    )
    const changedFiles = await loadLocalPatches(classifiedFiles, { rootPath, diffBaseSha }, logger)

    const reviewedTrigger = { ...current, headSha: reviewedSha }
    const scope = {
      trigger: reviewedTrigger,
      files: changedFiles,
      sharedContext: buildSharedContext({
        trigger: reviewedTrigger,
        files: changedFiles,
        standards,
        spec,
        history,
        ciStatus,
      }),
      changes: history?.changes ?? null,
      rootPath,
      diffBaseSha,
      signal,
      logger,
    }

    signal?.throwIfAborted()

    const team = await runReviewTeam({ ...scope, standards, spec })

    signal?.throwIfAborted()

    const verification = await verifyFindings(team.candidates, scope)
    const findings = orderFindings(verification.findings)

    signal?.throwIfAborted()

    const notReviewed = findUnreviewedFiles(changedFiles, team.reviewedPaths)
    const placed = placeFindings(findings, files)
    const event = resolveEvent(team, notReviewed)
    const fixedThreads = selectFixedThreads(team.overview, history)
    const review = {
      event,
      findings: placed,
      fixedThreads,
      output: { overview: team.overview, findings },
      passes: team.passes,
      verification: verification.stats,
      coverage: { files: changedFiles, reviewedPaths: team.reviewedPaths, notReviewed },
      context: { trigger: current, history, headSha: reviewedSha, standards, spec },
    }

    const walkthrough = renderWalkthrough({ ...review, ciStatus, reviewerLogin })
    await upsertWalkthrough({ repoFullName, prNumber, reviewerLogin, body: walkthrough }, { logger })

    signal?.throwIfAborted()

    try {
      await createPullRequestReview(repoFullName, prNumber, {
        commitId: reviewedSha,
        body: renderReviewBody(review),
        event,
        comments: placed.inline.map(toReviewComment),
      })
    } catch (err) {
      if (err.status !== 422) throw err
      logger.warn(`[review] Inline review rejected for ${dedupeKey} (${err.message}); retrying body-only`)
      await createPullRequestReview(repoFullName, prNumber, {
        commitId: reviewedSha,
        body: renderReviewBody({ ...review, isInlineInBody: true }),
        event,
      })
    }

    await resolveFixedThreads(
      { repoFullName, prNumber, headSha: reviewedSha, threads: fixedThreads },
      { logger, signal }
    )

    logger.log(`[review] Done ${dedupeKey}: ${event}, ${findings.length} finding(s)`)
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

async function loadLocalPatches(files, { rootPath, diffBaseSha }, logger) {
  if (!diffBaseSha) return files

  const loaded = []
  for (const file of files) {
    loaded.push(needsInlinePatch(file) ? await withLocalPatch(file, rootPath, diffBaseSha, logger) : file)
  }

  return loaded
}

function needsInlinePatch(file) {
  return needsLocalDiff(file) && !file.generated
}

async function withLocalPatch(file, rootPath, diffBaseSha, logger) {
  try {
    return { ...file, patch: await gitDiffAt(rootPath, file.filename, { baseSha: diffBaseSha }) }
  } catch (err) {
    logger.warn(
      `[review] Could not diff ${file.filename} locally (${err.message}); the reviewer reads it with get_file_diff`
    )
    return file
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

function resolveEvent({ overview, candidates, passes }, notReviewed) {
  const hasProposedBlocking = candidates.some(finding => REVIEW_BLOCKING_SEVERITIES.has(finding.severity))
  const hasFailedPass = passes.some(pass => pass.status === REVIEW_PASS_FAILED)
  const isApproved = overview?.verdict === 'approve' && !hasProposedBlocking && !hasFailedPass

  return isApproved && notReviewed.length === 0 ? 'APPROVE' : 'COMMENT'
}

function orderFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      REVIEW_SEVERITIES.indexOf(a.severity) - REVIEW_SEVERITIES.indexOf(b.severity) ||
      a.path.localeCompare(b.path) ||
      (a.line ?? MISSING_LINE) - (b.line ?? MISSING_LINE)
  )
}

function placeFindings(findings, files) {
  const nits = findings.filter(finding => finding.severity === NIT_SEVERITY)
  const actionable = findings.filter(finding => finding.severity !== NIT_SEVERITY)
  const { anchored, unanchored } = partitionFindings(actionable, files)

  return { inline: anchored, outside: unanchored, nits }
}

function toReviewComment(finding) {
  const comment = { path: finding.path, line: finding.line, side: 'RIGHT', body: renderInlineComment(finding) }
  if (finding.anchorStartLine === null) return comment

  return { ...comment, start_line: finding.anchorStartLine, start_side: 'RIGHT' }
}
