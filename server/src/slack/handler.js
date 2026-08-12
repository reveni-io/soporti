import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import config from '../config.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { upsertSlackUser, getCustomInstructions } from '../db/users.js'
import { recordAgentRun } from '../db/agent-runs.js'
import { UNKNOWN_TOOL, toolNames } from '../agent/run-items.js'
import { extractUsage, formatUsage } from '../llm/usage.js'
import { AGENT_CHANNEL_SLACK, RUN_STATUS_ERROR, RUN_STATUS_OK } from '../constants.js'

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [slack] ${icon}`, ...args)
}

async function notifyProgress(onProgress, event) {
  if (!onProgress) return

  try {
    await onProgress(event)
  } catch (err) {
    console.error('[slack] Progress update failed:', err.message)
  }
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
  isNewConversation,
  onProgress,
}) {
  log('👤', `Slack user ID: ${slackUserId || 'unknown'}`)

  const [similarCases, customInstructions] = await Promise.all([
    isNewConversation ? searchSimilarCases(message) : [],
    loadCustomInstructionsForSlack(slackUserId, slackUserName),
  ])
  if (similarCases.length > 0) {
    log('📚', `Found ${similarCases.length} similar case(s)`)
  }
  if (customInstructions) {
    log('🧭', `Custom instructions applied (${customInstructions.length} chars)`)
  }

  const agent = await createAgent(selectedSources, profile, { customInstructions })
  const agentInput = buildUserTurn(message, { similarCases })
  const startTime = Date.now()
  const toolCalls = []
  const callIdToTaskId = new Map()
  let fullText = ''
  let runUsage = null

  log('🚀', `Agent started for: "${message.slice(0, 120)}"`)

  let sentText = false
  let unpersistedItems = null

  async function runTurn(prevResponseId) {
    fullText = ''
    toolCalls.length = 0
    callIdToTaskId.clear()
    sentText = false

    const stream = await run(agent, agentInput, {
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
          await notifyProgress(onProgress, { type: 'text_delta', delta: data.delta })
        }
      } else if (event.type === 'run_item_stream_event') {
        const item = event.item
        if (item.type === 'tool_call_item') {
          const toolName = item.rawItem?.name || UNKNOWN_TOOL
          const toolArgs = item.rawItem?.arguments || '{}'
          const taskId = `task-${toolCalls.length}`
          const callId = item.rawItem?.callId

          log('  →', toolName)
          toolCalls.push({ name: toolName, arguments: toolArgs })
          if (callId) callIdToTaskId.set(callId, taskId)

          await notifyProgress(onProgress, { type: 'tool_start', taskId, name: toolName, arguments: toolArgs })
        } else if (item.type === 'tool_call_output_item') {
          const taskId = callIdToTaskId.get(item.rawItem?.callId)
          if (taskId) await notifyProgress(onProgress, { type: 'tool_end', taskId })
        }
      }
    }

    await stream.completed

    runUsage = extractUsage(stream.state?.usage)
    const usage = formatUsage(stream.state?.usage)
    if (usage) log('📊', usage)

    unpersistedItems = prevResponseId ? stream.history : null
    return stream.lastResponseId
  }

  async function runWithRetry() {
    try {
      return await runTurn(previousResponseId)
    } catch (err) {
      if (!previousResponseId || sentText) throw err

      log('♻️', `Retrying without previousResponseId (${err.message})`)
      return runTurn(undefined)
    }
  }

  let lastResponseId
  try {
    lastResponseId = await runWithRetry()
  } catch (err) {
    await recordAgentRun({ channel: AGENT_CHANNEL_SLACK, status: RUN_STATUS_ERROR })
    throw err
  }

  const durationMs = Date.now() - startTime
  log('✅', `Done in ${durationMs}ms (${toolCalls.length} tool calls)`)

  await recordAgentRun({
    channel: AGENT_CHANNEL_SLACK,
    status: RUN_STATUS_OK,
    usage: runUsage,
    durationMs,
    tools: toolNames(toolCalls),
  })

  const footer = isYoloMode(selectedSources) ? buildSourcesFooter(toolCalls) : ''

  return { text: fullText + footer, footer, toolCalls, durationMs, lastResponseId, unpersistedItems }
}
