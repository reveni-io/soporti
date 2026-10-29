import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import { buildAgentInput } from '../agent/agent-input.js'
import { YOLO_SOURCE } from '../agent/sources.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { redactSecrets } from '../review/output-guard.js'
import { formatUsage } from '../llm/usage.js'
import { traceAgentRun, trackAgentRun } from '../agent/run-tracking.js'
import { AGENT_CHANNEL_AUTO_DIAGNOSE, TOOL_NOT_FOUND_BEHAVIOR } from '../constants.js'
import config from '../config.js'
import { buildDiagnosisPrompt, buildTicketText } from './diagnose-prompt.js'

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [auto-diagnose] ${icon}`, ...args)
}

export async function diagnoseTicket(ticket, { images = [] } = {}) {
  const ticketText = buildTicketText(ticket)
  const similarCases = await searchSimilarCases(ticketText).catch(() => [])
  if (similarCases.length > 0) log('📚', `Found ${similarCases.length} similar case(s)`)

  const agent = await createAgent([YOLO_SOURCE], config.autoDiagnose.profile, {
    customInstructions: '',
  })

  const input = buildAgentInput(buildUserTurn(buildDiagnosisPrompt(ticket), { similarCases }), images)
  log('🚀', `Diagnosing ticket "${(ticket?.title ?? '').slice(0, 80)}" (${images.length} image(s))`)

  const { result, durationMs } = await trackAgentRun(
    { channel: AGENT_CHANNEL_AUTO_DIAGNOSE, subject: ticket?.id ?? null },
    () =>
      traceAgentRun({ sessionId: ticket?.id, question: ticket?.title }, () =>
        run(agent, input, { maxTurns: config.agent.maxIterations, toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR })
      )
  )

  const usage = formatUsage(result?.state?.usage)
  if (usage) log('📊', usage)

  const output = result?.finalOutput
  const text = typeof output === 'string' ? output : output == null ? '' : JSON.stringify(output)
  log('✅', `Diagnosis done in ${durationMs}ms (${text.length} chars)`)

  return redactSecrets(text)
}
