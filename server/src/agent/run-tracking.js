import { withTrace } from '@openai/agents'
import { recordAgentRun } from '../db/agent-runs.js'
import { extractUsage, sumUsage } from '../llm/usage.js'
import { RUN_STATUS_ERROR, RUN_STATUS_OK } from '../constants.js'
import { toolNames, toolNamesFromResult } from './run-items.js'

const TRACE_NAME = 'Agent workflow'

function traceMetadata(fields) {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
      .map(([key, value]) => [key, String(value)])
  )
}

export function traceAgentRun({ sessionId = null, userId = null, question = null }, runAgent) {
  return withTrace(TRACE_NAME, runAgent, { metadata: traceMetadata({ sessionId, userId, question }) })
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
