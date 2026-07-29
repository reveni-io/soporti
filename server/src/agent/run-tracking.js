import { recordAgentRun } from '../db/agent-runs.js'
import { extractUsage } from '../llm/usage.js'
import { RUN_STATUS_ERROR, RUN_STATUS_OK } from '../constants.js'
import { toolNamesFromResult } from './run-items.js'

export async function trackAgentRun({ channel, subject = null, failureReason = null }, runAgent) {
  const startTime = Date.now()

  let result
  try {
    result = await runAgent()
  } catch (err) {
    await recordAgentRun({ channel, status: RUN_STATUS_ERROR, subject })
    throw err
  }

  const durationMs = Date.now() - startTime
  const failure = failureReason?.(result) ?? null

  await recordAgentRun({
    channel,
    status: failure ? RUN_STATUS_ERROR : RUN_STATUS_OK,
    subject,
    usage: extractUsage(result?.state?.usage),
    durationMs,
    tools: toolNamesFromResult(result),
  })

  if (failure) throw new Error(failure)

  return { result, durationMs }
}
