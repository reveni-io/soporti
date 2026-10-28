import { z } from 'zod'
import { generateTraceId, getGlobalTraceProvider, run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import { buildAgentInput } from '../agent/agent-input.js'
import { isSourceList } from '../agent/sources.js'
import { DEFAULT_PROFILE, VALID_PROFILES } from '../agent/system-prompt.js'
import { traceAgentRun, trackAgentRun } from '../agent/run-tracking.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { getLangfuseConfig, isLangfuseConfigured } from '../langfuse/settings.js'
import { langfuseTraceId } from '../langfuse/client.js'
import {
  createLangfuseClient,
  describeError,
  isLangfuseNotFound,
  linkDatasetRunItem,
  listDatasetItems,
} from '../langfuse/sdk.js'
import { AGENT_CHANNEL_EXPERIMENT } from '../constants.js'
import config from '../config.js'
import { resolveVariant } from './variants.js'

const MAX_EXPERIMENT_ITEMS = 50
const AGENT_RUN_TIMEOUT_MS = 10 * 60_000

const ACTIVE_ITEM_STATUS = 'ACTIVE'
const TIMEOUT_ERROR_NAME = 'TimeoutError'
const RUN_STAMP_LENGTH = 19

const ITEM_INPUT_SCHEMA = z.object({
  question: z.string().trim().min(1),
  sources: z.array(z.string()).refine(isSourceList),
  profile: z.enum(VALID_PROFILES).optional(),
})

let running = false

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [experiments] ${icon}`, ...args)
}

export function claimExperimentSlot() {
  if (running) return false

  running = true
  return true
}

export function releaseExperimentSlot() {
  running = false
}

function partitionItems(items) {
  const valid = []
  const skipped = []

  for (const item of items) {
    const parsed = ITEM_INPUT_SCHEMA.safeParse(item.input)
    if (parsed.success) valid.push({ id: item.id, input: parsed.data })
    else skipped.push(item.id)
  }

  return { valid, skipped }
}

async function loadDatasetItems(client, datasetName) {
  let listed
  try {
    listed = await listDatasetItems(client, datasetName)
  } catch (err) {
    if (isLangfuseNotFound(err)) return { status: 404, error: `Dataset ${datasetName} not found.` }
    throw err
  }

  const active = listed.items.filter(item => item.status === ACTIVE_ITEM_STATUS)
  if (listed.items.length === 0) return { status: 404, error: `Dataset ${datasetName} not found or empty.` }
  if (listed.hasMorePages || active.length > MAX_EXPERIMENT_ITEMS) {
    return { status: 400, error: `An experiment runs at most ${MAX_EXPERIMENT_ITEMS} active items.` }
  }

  const { valid, skipped } = partitionItems(active)
  if (valid.length === 0) {
    return { status: 400, error: 'No active item has an input of the shape { question, sources, profile? }.' }
  }

  return { value: { items: valid, skipped } }
}

async function resolveVariants(client, variants) {
  const resolved = await Promise.all(variants.map(variant => resolveVariant(client, variant)))
  const failure = resolved.find(result => result.error)
  if (failure) return failure

  return { value: resolved.map(result => result.value) }
}

async function resolveLangfuseClient() {
  const langfuse = await getLangfuseConfig()
  if (!isLangfuseConfigured(langfuse)) return { status: 422, error: 'Configure Langfuse in /admin first.' }
  if (langfuse.metadataOnly) {
    return { status: 422, error: 'Experiments need question and answer content, which metadata-only mode keeps out.' }
  }

  return { value: createLangfuseClient(langfuse) }
}

export async function prepareExperiment({ dataset, runName, variants }) {
  const client = await resolveLangfuseClient()
  if (client.error) return client

  const loaded = await loadDatasetItems(client.value, dataset)
  if (loaded.error) return loaded

  const resolved = await resolveVariants(client.value, variants)
  if (resolved.error) return resolved

  const stamp = new Date().toISOString().slice(0, RUN_STAMP_LENGTH)
  const runs = resolved.value.map(variant => ({ ...variant, runName: `${runName} [${variant.key}] ${stamp}` }))

  return { value: { client: client.value, dataset, runs, ...loaded.value } }
}

async function withDeadline(task, timeoutMs) {
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`Agent run exceeded ${timeoutMs} ms.`), { name: TIMEOUT_ERROR_NAME })),
      timeoutMs
    )
  })

  try {
    return await Promise.race([task, deadline])
  } finally {
    clearTimeout(timer)
  }
}

function buildAgent(variant, item, nestedUsage) {
  return createAgent(item.input.sources, item.input.profile ?? DEFAULT_PROFILE, {
    readOnly: true,
    promptOverrides: variant.overrides,
    onNestedUsage: usage => nestedUsage.push(usage),
  })
}

function runAgent(agent, variant, item, { agentInput, traceId, nestedUsage }) {
  return trackAgentRun({ channel: AGENT_CHANNEL_EXPERIMENT, subject: variant.runName, nestedUsage }, () =>
    traceAgentRun({ sessionId: variant.runName, question: item.input.question, traceId }, () =>
      run(agent, agentInput, {
        maxTurns: config.agent.maxIterations,
        signal: AbortSignal.timeout(AGENT_RUN_TIMEOUT_MS),
      })
    )
  )
}

async function linkItem(client, variant, item, traceId) {
  await getGlobalTraceProvider().forceFlush()
  await linkDatasetRunItem(client, {
    runName: variant.runName,
    datasetItemId: item.id,
    traceId: langfuseTraceId(traceId),
    metadata: { promptVersion: variant.promptVersion, variant: variant.key },
  })
}

async function runVariant(client, variant, item, agentInput) {
  const traceId = generateTraceId()
  const nestedUsage = []

  let agent
  try {
    agent = await buildAgent(variant, item, nestedUsage)
  } catch (err) {
    log('⚠️', `Item ${item.id} was not run under ${variant.key}:`, describeError(err))
    return
  }

  try {
    await withDeadline(runAgent(agent, variant, item, { agentInput, traceId, nestedUsage }), AGENT_RUN_TIMEOUT_MS)
  } catch (err) {
    log('⚠️', `Item ${item.id} failed under ${variant.key}:`, describeError(err))
  }

  try {
    await linkItem(client, variant, item, traceId)
  } catch (err) {
    log('⚠️', `Item ${item.id} could not be linked to ${variant.runName}:`, describeError(err))
  }
}

async function buildItemInput(question) {
  const similarCases = await searchSimilarCases(question).catch(() => [])

  return buildAgentInput(buildUserTurn(question, { similarCases }))
}

async function executeExperiment({ client, runs, items }) {
  for (const item of items) {
    const agentInput = await buildItemInput(item.input.question)
    await Promise.allSettled(runs.map(variant => runVariant(client, variant, item, agentInput)))
  }

  log('✅', `Finished ${runs.map(variant => variant.runName).join(', ')} over ${items.length} item(s)`)
}

export function startExperiment(plan) {
  log('🚀', `Starting ${plan.runs.map(variant => variant.runName).join(', ')} over ${plan.items.length} item(s)`)

  executeExperiment(plan)
    .catch(err => console.error('Experiment failed:', describeError(err)))
    .finally(releaseExperimentSlot)
}
