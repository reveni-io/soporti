import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import config from '../config.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { upsertSlackUser, getCustomInstructions } from '../db/users.js'

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [slack] ${icon}`, ...args)
}

async function loadCustomInstructionsForSlack(slackUserId, slackUserName) {
  if (!slackUserId) return ''
  try {
    const user = await upsertSlackUser({ slackId: slackUserId, name: slackUserName ?? null })
    const text = await getCustomInstructions(user.id)
    return text ?? ''
  } catch (err) {
    console.error('[slack] Failed to load custom instructions:', err.message)
    return ''
  }
}

export async function processMessage({
  message,
  selectedSources,
  session,
  previousResponseId,
  profile,
  slackUserId,
  slackUserName,
}) {
  log('👤', `Slack user ID: ${slackUserId || 'unknown'}`)

  const [similarCases, customInstructions] = await Promise.all([
    searchSimilarCases(message),
    loadCustomInstructionsForSlack(slackUserId, slackUserName),
  ])
  if (similarCases.length > 0) {
    log('📚', `Found ${similarCases.length} similar case(s)`)
  }
  if (customInstructions) {
    log('🧭', `Custom instructions applied (${customInstructions.length} chars)`)
  }

  const agent = await createAgent(selectedSources, profile, similarCases, {
    customInstructions,
  })
  const startTime = Date.now()
  const toolCalls = []
  let fullText = ''

  log('🚀', `Agent started for: "${message.slice(0, 120)}"`)

  // Runs one streaming turn. On the first attempt we chain the persisted
  // previousResponseId; if OpenAI has expired it (and no text has streamed yet)
  // we retry once without it, relying on the conversation items in the DB.
  let sentText = false

  async function runTurn(prevResponseId) {
    fullText = ''
    toolCalls.length = 0
    sentText = false

    // Keep the SDK default reasoningItemIdPolicy ('preserve') — reasoning items
    // must stay paired with their function_call. Rationale lives on
    // PostgresSession.getItems, which sanitizes replayed history.
    const stream = await run(agent, message, {
      stream: true,
      maxTurns: config.agent.maxIterations,
      session,
      previousResponseId: prevResponseId,
    })

    for await (const event of stream.toStream()) {
      if (event.type === 'raw_model_stream_event') {
        const data = event.data
        if (data.type === 'output_text_delta') {
          sentText = true
          fullText += data.delta
        }
      } else if (event.type === 'run_item_stream_event') {
        const item = event.item
        if (item.type === 'tool_call_item') {
          const toolName = item.rawItem?.name || 'unknown'
          const toolArgs = item.rawItem?.arguments || '{}'
          log('  →', toolName)
          toolCalls.push({ name: toolName, arguments: toolArgs })
        }
      }
    }

    await stream.completed
    return stream.lastResponseId
  }

  let lastResponseId
  try {
    lastResponseId = await runTurn(previousResponseId)
  } catch (err) {
    if (previousResponseId && !sentText) {
      log('♻️', `Retrying without previousResponseId (${err.message})`)
      lastResponseId = await runTurn(undefined)
    } else {
      throw err
    }
  }

  const durationMs = Date.now() - startTime
  log('✅', `Done in ${durationMs}ms (${toolCalls.length} tool calls)`)

  let finalText = fullText
  if (isYoloMode(selectedSources)) {
    finalText += buildSourcesFooter(toolCalls)
  }

  return { text: finalText, toolCalls, durationMs, lastResponseId }
}
