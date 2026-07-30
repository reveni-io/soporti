import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import { YOLO_SOURCE } from '../agent/sources.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { redactSecrets } from '../review/output-guard.js'
import { formatUsage } from '../llm/usage.js'
import { trackAgentRun } from '../agent/run-tracking.js'
import { AGENT_CHANNEL_AUTO_DIAGNOSE } from '../constants.js'
import config from '../config.js'
import { buildDiagnosisPrompt, buildTicketText } from './diagnose-prompt.js'

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [auto-diagnose] ${icon}`, ...args)
}

export function buildAgentInput(promptText, images = []) {
  if (!Array.isArray(images) || images.length === 0) return promptText
  return [
    {
      role: 'user',
      content: [{ type: 'input_text', text: promptText }, ...images.map(image => ({ type: 'input_image', image }))],
    },
  ]
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
    () => run(agent, input, { maxTurns: config.agent.maxIterations })
  )

  const usage = formatUsage(result?.state?.usage)
  if (usage) log('📊', usage)

  const output = result?.finalOutput
  const text = typeof output === 'string' ? output : output == null ? '' : JSON.stringify(output)
  log('✅', `Diagnosis done in ${durationMs}ms (${text.length} chars)`)

  return redactSecrets(text)
}
