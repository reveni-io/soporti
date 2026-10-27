import { run } from '@openai/agents'
import { traceAgentRun } from '../agent/run-tracking.js'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import config from '../config.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { upsertSlackUser, getCustomInstructions } from '../db/users.js'
import { recordAgentRun } from '../db/agent-runs.js'
import { UNKNOWN_TOOL, toolNames } from '../agent/run-items.js'
import { extractUsage, formatUsage, sumUsage } from '../llm/usage.js'
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

async function loadSlackUserContext(slackUserId, slackUserName) {
  if (!slackUserId) return { userId: null, customInstructions: '' }
  try {
    const user = await upsertSlackUser({ slackId: slackUserId, name: slackUserName ?? null })
    const text = await getCustomInstructions(user.id)
    return { userId: user.id, customInstructions: text ?? '' }
  } catch (err) {
    console.error('[slack] Failed to load the Slack user:', err.message)
    return { userId: null, customInstructions: '' }
  }
}

function resetTurn(turn) {
  turn.text = ''
  turn.sentText = false
  turn.toolCalls.length = 0
  turn.nestedUsage.length = 0
  turn.callIdToTaskId.clear()
}

async function forwardTextDelta(data, turn, onProgress) {
  if (data.type !== 'output_text_delta') return

  turn.sentText = true
  turn.text += data.delta
  await notifyProgress(onProgress, { type: 'text_delta', delta: data.delta })
}

async function startToolCall(rawItem, turn, onProgress) {
  const toolName = rawItem?.name || UNKNOWN_TOOL
  const toolArgs = rawItem?.arguments || '{}'
  const taskId = `task-${turn.toolCalls.length}`

  log('  →', toolName)
  turn.toolCalls.push({ name: toolName, arguments: toolArgs })
  if (rawItem?.callId) turn.callIdToTaskId.set(rawItem.callId, taskId)

  await notifyProgress(onProgress, { type: 'tool_start', taskId, name: toolName, arguments: toolArgs })
}

async function forwardRunItem(item, turn, onProgress) {
  if (item.type === 'tool_call_item') {
    await startToolCall(item.rawItem, turn, onProgress)
    return
  }
  if (item.type !== 'tool_call_output_item') return

  const taskId = turn.callIdToTaskId.get(item.rawItem?.callId)
  if (taskId) await notifyProgress(onProgress, { type: 'tool_end', taskId })
}

async function forwardStreamEvent(event, turn, onProgress) {
  if (event.type === 'raw_model_stream_event') await forwardTextDelta(event.data, turn, onProgress)
  if (event.type === 'run_item_stream_event') await forwardRunItem(event.item, turn, onProgress)
}

export async function processMessage({
  message,
  displayQuestion = null,
  conversationId = null,
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

  const [similarCases, { userId, customInstructions }] = await Promise.all([
    isNewConversation ? searchSimilarCases(message) : [],
    loadSlackUserContext(slackUserId, slackUserName),
  ])
  if (similarCases.length > 0) {
    log('📚', `Found ${similarCases.length} similar case(s)`)
  }
  if (customInstructions) {
    log('🧭', `Custom instructions applied (${customInstructions.length} chars)`)
  }

  const turn = { text: '', sentText: false, toolCalls: [], nestedUsage: [], callIdToTaskId: new Map() }

  const agent = await createAgent(selectedSources, profile, {
    customInstructions,
    userId,
    onNestedToolCall: call => turn.toolCalls.push(call),
    onNestedUsage: usage => turn.nestedUsage.push(usage),
  })
  const agentInput = buildUserTurn(message, { similarCases })
  const startTime = Date.now()
  let runUsage = null

  log('🚀', `Agent started for: "${message.slice(0, 120)}"`)

  let unpersistedItems = null

  async function runTurn(prevResponseId) {
    resetTurn(turn)

    const trace = { sessionId: conversationId, userId, question: displayQuestion ?? message }
    const stream = await traceAgentRun(trace, () =>
      run(agent, agentInput, {
        stream: true,
        maxTurns: config.agent.maxIterations,
        session,
        previousResponseId: prevResponseId,
      })
    )

    for await (const event of stream.toStream()) {
      await forwardStreamEvent(event, turn, onProgress)
    }

    await stream.completed

    runUsage = sumUsage([extractUsage(stream.state?.usage), ...turn.nestedUsage])
    const usage = formatUsage(stream.state?.usage)
    if (usage) log('📊', usage)

    unpersistedItems = prevResponseId ? stream.history : null
    return stream.lastResponseId
  }

  async function runWithRetry() {
    try {
      return await runTurn(previousResponseId)
    } catch (err) {
      if (!previousResponseId || turn.sentText) throw err

      log('♻️', `Retrying without previousResponseId (${err.message})`)
      return runTurn(undefined)
    }
  }

  let lastResponseId
  try {
    lastResponseId = await runWithRetry()
  } catch (err) {
    await recordAgentRun({ channel: AGENT_CHANNEL_SLACK, status: RUN_STATUS_ERROR, userId })
    throw err
  }

  const durationMs = Date.now() - startTime
  log('✅', `Done in ${durationMs}ms (${turn.toolCalls.length} tool calls)`)

  await recordAgentRun({
    channel: AGENT_CHANNEL_SLACK,
    status: RUN_STATUS_OK,
    userId,
    usage: runUsage,
    durationMs,
    tools: toolNames(turn.toolCalls),
  })

  const footer = isYoloMode(selectedSources) ? buildSourcesFooter(turn.toolCalls) : ''

  return { text: turn.text + footer, footer, toolCalls: turn.toolCalls, durationMs, lastResponseId, unpersistedItems }
}
