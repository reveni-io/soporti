import config from '../config.js'
import {
  AGENT_CHANNEL_PR_REVIEW,
  REVIEW_OVERVIEW_PASS,
  REVIEW_PASS_COMPLETED,
  REVIEW_PASS_FAILED,
} from '../constants.js'
import {
  buildDataTools,
  buildDiffTools,
  buildRepoTools,
  finderOutputSchema,
  overviewOutputSchema,
  runReviewAgent,
} from './agent.js'
import { inline } from './context.js'
import { buildFinderInstructions, buildFinderTask, buildOverviewInstructions, buildOverviewTask } from './prompt.js'
import { mapWithConcurrency } from './concurrency.js'

const MAX_PARALLEL_PASSES = 4
const SHARD_CHANGED_LINES = 1500
const MAX_CORRECTNESS_SHARDS = 4
const FINDER_LENSES = [
  { lens: 'correctness', withDataTools: true, isSharded: true, applies: () => true },
  { lens: 'security', withDataTools: false, isSharded: false, applies: () => true },
  { lens: 'standards', withDataTools: false, isSharded: false, applies: hasStandards },
  { lens: 'spec', withDataTools: true, isSharded: false, applies: hasLoadedStory },
]

export async function runReviewTeam({
  trigger,
  files,
  standards,
  spec,
  sharedContext,
  changes = null,
  rootPath = null,
  diffBaseSha = null,
  signal,
  logger = console,
}) {
  const passes = planPasses({ repoFullName: trigger.repoFullName, files, standards, spec })
  const scope = {
    trigger,
    files,
    sharedContext,
    changes,
    rootPath,
    diffBaseSha,
    repoTools: buildRepoTools(trigger.repoFullName, rootPath),
    dataTools: await buildDataTools(),
    signal,
    logger,
  }

  const results = await mapWithConcurrency(passes, MAX_PARALLEL_PASSES, pass => runPass(pass, scope))
  const finders = results.filter(result => result.lens !== REVIEW_OVERVIEW_PASS)
  if (finders.every(result => result.status === REVIEW_PASS_FAILED)) throw finders[0].error

  const [overview] = results
  const completed = results.filter(result => result.status === REVIEW_PASS_COMPLETED)

  return {
    overview: overview.status === REVIEW_PASS_COMPLETED ? overview.output : null,
    candidates: completed.flatMap(collectFindings),
    passes: results.map(({ lens, status, wrappedUp = false, output }) => ({
      lens,
      status,
      wrappedUp,
      note: output?.note ?? null,
    })),
    reviewedPaths: new Set(completed.flatMap(result => [...result.reviewedPaths])),
  }
}

function planPasses({ repoFullName, files, standards, spec }) {
  const finders = FINDER_LENSES.filter(lens => lens.applies({ standards, spec })).flatMap(lens =>
    lens.isSharded ? shardPasses(repoFullName, lens, files) : [finderPass(repoFullName, lens)]
  )

  return [overviewPass(repoFullName), ...finders]
}

function overviewPass(repoFullName) {
  return {
    lens: REVIEW_OVERVIEW_PASS,
    label: REVIEW_OVERVIEW_PASS,
    name: 'Soporti Review Overview',
    instructions: buildOverviewInstructions(repoFullName),
    task: buildOverviewTask(),
    outputType: overviewOutputSchema,
    withDataTools: false,
  }
}

function finderPass(repoFullName, { lens, withDataTools }, shard = null) {
  return {
    lens,
    label: shard ? `${lens} (shard ${shard.index} of ${shard.count})` : lens,
    name: `Soporti Review Finder (${lens})`,
    instructions: buildFinderInstructions(repoFullName),
    task: buildFinderTask(lens, shard),
    outputType: finderOutputSchema,
    withDataTools,
  }
}

function shardPasses(repoFullName, lens, files) {
  const reviewable = files.filter(file => !file.generated && !file.empty)
  const shards = sumChangedLines(reviewable) > SHARD_CHANGED_LINES ? splitIntoShards(reviewable) : []
  if (shards.length < 2) return [finderPass(repoFullName, lens)]

  return shards.map((shard, index) =>
    finderPass(repoFullName, lens, {
      index: index + 1,
      count: shards.length,
      focusFiles: shard.map(file => inline(file.filename)),
    })
  )
}

function splitIntoShards(files) {
  const total = sumChangedLines(files)
  const count = Math.min(MAX_CORRECTNESS_SHARDS, Math.ceil(total / SHARD_CHANGED_LINES))
  const shards = Array.from({ length: count }, () => [])
  let assigned = 0

  for (const file of files) {
    const lines = changedLines(file)
    const index = Math.min(count - 1, Math.floor(((assigned + lines / 2) * count) / total))
    shards[index].push(file)
    assigned += lines
  }

  return shards.filter(shard => shard.length > 0)
}

function sumChangedLines(files) {
  return files.reduce((sum, file) => sum + changedLines(file), 0)
}

function changedLines(file) {
  return (file.additions ?? 0) + (file.deletions ?? 0)
}

async function runPass(pass, scope) {
  const { trigger, files, sharedContext, changes, rootPath, diffBaseSha, repoTools, dataTools, signal, logger } = scope
  const subject = `${trigger.repoFullName}#${trigger.prNumber}`
  const diff = buildDiffTools({ files, changes, rootPath, diffBaseSha, inlinedPaths: sharedContext.inlinedPaths })

  signal?.throwIfAborted()

  try {
    const { output, wrappedUp } = await runReviewAgent({
      name: pass.name,
      instructions: pass.instructions,
      tools: [...repoTools, ...diff.tools, ...(pass.withDataTools ? dataTools : [])],
      outputType: pass.outputType,
      sharedContext,
      task: pass.task,
      channel: AGENT_CHANNEL_PR_REVIEW,
      subject,
      maxTurns: config.review.maxTurns,
      signal,
      logger,
    })
    if (wrappedUp) logger.warn(`[review] The ${pass.label} pass wrapped up at the turn limit on ${subject}`)

    return { lens: pass.lens, status: REVIEW_PASS_COMPLETED, wrappedUp, output, reviewedPaths: diff.reviewedPaths }
  } catch (err) {
    if (signal?.aborted) throw err

    logger.warn(`[review] The ${pass.label} pass failed on ${subject} (${err.message}); continuing without it`)
    return { lens: pass.lens, status: REVIEW_PASS_FAILED, error: err }
  }
}

function collectFindings({ lens, output }) {
  if (lens === REVIEW_OVERVIEW_PASS) return []

  return output.findings.map(finding => ({ ...finding, lens }))
}

function hasStandards({ standards }) {
  return standards.documents.length > 0 || standards.notInlined.length > 0
}

function hasLoadedStory({ spec }) {
  return spec.stories.some(entry => entry.story !== null)
}
