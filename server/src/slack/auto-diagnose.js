import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { YOLO_SOURCE } from '../agent/sources.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { redactSecrets } from '../review/output-guard.js'
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

  const agent = await createAgent([YOLO_SOURCE], config.autoDiagnose.profile, similarCases, {
    customInstructions: '',
  })

  const input = buildAgentInput(buildDiagnosisPrompt(ticket), images)
  const startTime = Date.now()
  log('🚀', `Diagnosing ticket "${(ticket?.title ?? '').slice(0, 80)}" (${images.length} image(s))`)

  const result = await run(agent, input, { maxTurns: config.agent.maxIterations })
  const durationMs = Date.now() - startTime

  const output = result?.finalOutput
  const text = typeof output === 'string' ? output : output == null ? '' : JSON.stringify(output)
  log('✅', `Diagnosis done in ${durationMs}ms (${text.length} chars)`)

  return redactSecrets(text)
}
