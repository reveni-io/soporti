import { generateSpanId, withCustomSpan, withTrace } from '@openai/agents'
import { recordAgentRun } from '../db/agent-runs.js'
import { extractUsage, sumUsage } from '../llm/usage.js'
import { RUN_STATUS_ERROR, RUN_STATUS_OK } from '../constants.js'
import { toolNames, toolNamesFromResult } from './run-items.js'

const TRACE_NAME = 'Agent workflow'
const EXPERIMENT_ROOT_SPAN_NAME = 'experiment-item-run'

function traceMetadata(fields) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
      .map(([key, value]) => [key, String(value)])
  )
}

function experimentFields(experiment, rootSpanId) {
  if (!experiment) return {}

  return {
    experimentId: experiment.id,
    experimentName: experiment.name,
    experimentDatasetId: experiment.datasetId,
    experimentItemId: experiment.itemId,
    experimentMetadata: experiment.metadata ? JSON.stringify(experiment.metadata) : null,
    experimentRootSpanId: rootSpanId,
  }
}

function underExperimentRoot(rootSpanId, runAgent) {
  return () => withCustomSpan(() => runAgent(), { spanId: rootSpanId, data: { name: EXPERIMENT_ROOT_SPAN_NAME } })
}

export function traceAgentRun(
  { sessionId = null, userId = null, question = null, effort = null, experiment = null },
  runAgent
) {
  const rootSpanId = experiment ? generateSpanId() : null
  const metadata = traceMetadata({ sessionId, userId, question, effort, ...experimentFields(experiment, rootSpanId) })

  return withTrace(TRACE_NAME, experiment ? underExperimentRoot(rootSpanId, runAgent) : runAgent, { metadata })
}

export async function trackAgentRun(
  { channel, subject = null, userId = null, failureReason = null, nestedUsage = [], nestedToolCalls = [] },
  runAgent
) {
  const startTime = Date.now()

  let result
  try {
    result = await runAgent()
  } catch (err) {
    await recordAgentRun({ channel, status: RUN_STATUS_ERROR, subject, userId })
    throw err
  }

  const durationMs = Date.now() - startTime
  const failure = failureReason?.(result) ?? null

  await recordAgentRun({
    channel,
    status: failure ? RUN_STATUS_ERROR : RUN_STATUS_OK,
    subject,
    userId,
    usage: sumUsage([extractUsage(result?.state?.usage), ...nestedUsage]),
    durationMs,
    tools: [...toolNamesFromResult(result), ...toolNames(nestedToolCalls)],
  })

  if (failure) throw new Error(failure)

  return { result, durationMs }
}
