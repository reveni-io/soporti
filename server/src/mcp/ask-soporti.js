import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import { buildSourcesFooter } from '../agent/sources.js'
import config from '../config.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { getCustomInstructions } from '../db/users.js'
import { getSkillsByIds } from '../db/skills.js'
import { trackAgentRun } from '../agent/run-tracking.js'
import { UNKNOWN_TOOL } from '../agent/run-items.js'
import { AGENT_CHANNEL_MCP, EMPTY_ANSWER_ERROR } from '../constants.js'

export function resolveScopedSources(requested, scope) {
  const requestedList = Array.isArray(requested) ? requested : []
  const scopeList = Array.isArray(scope) ? scope : []

  if (scopeList.length === 0) return { sources: requestedList }
  if (requestedList.length === 0) return { sources: scopeList }

  const denied = requestedList.filter(source => !scopeList.includes(source))
  if (denied.length > 0) return { denied }

  return { sources: requestedList }
}

export function appendFollowUpHint(answer, conversationId) {
  return `${answer}\n\n_Continue this thread by calling \`follow_up\` with conversationId "${conversationId}"._`
}

export async function executeAskSoporti({
  question,
  sources,
  profile,
  skillIds,
  userId,
  conversation,
  onProgress,
  signal,
}) {
  function report(message) {
    Promise.resolve()
      .then(() => onProgress?.(message))
      .catch(err => console.error('Failed to report MCP progress:', err))
  }

  const [similarCases, customInstructions, skills] = await Promise.all([
    conversation.isNewConversation ? searchSimilarCases(question) : [],
    getCustomInstructions(userId).catch(err => {
      console.error('Failed to load custom instructions:', err)
      return null
    }),
    skillIds.length > 0
      ? getSkillsByIds(skillIds, userId).catch(err => {
          console.error('Failed to load skills:', err)
          return []
        })
      : [],
  ])

  const toolCalls = []
  const nestedToolCalls = []
  const nestedUsage = []

  const agent = await createAgent(sources, profile, {
    customInstructions: customInstructions ?? '',
    skills,
    skillArguments: question,
    userId,
    onNestedToolCall: call => nestedToolCalls.push(call),
    onNestedUsage: usage => nestedUsage.push(usage),
  })
  const agentInput = buildUserTurn(question, { similarCases, commands: skills.map(skill => skill.name) })

  const textParts = []
  const callIdToName = new Map()
  let lastResponseId
  let unpersistedItems = null

  async function runTurn(previousResponseId) {
    textParts.length = 0
    toolCalls.length = 0
    nestedToolCalls.length = 0
    nestedUsage.length = 0
    callIdToName.clear()

    const stream = await run(agent, agentInput, {
      stream: true,
      maxTurns: config.agent.maxIterations,
      signal,
      session: conversation.session,
      previousResponseId,
    })

    for await (const event of stream.toStream()) {
      if (event.type === 'raw_model_stream_event') {
        if (event.data?.type === 'output_text_delta') textParts.push(event.data.delta)
        continue
      }

      if (event.type !== 'run_item_stream_event') continue

      const item = event.item
      if (item?.type === 'tool_call_item') {
        const toolName = item.rawItem?.name || UNKNOWN_TOOL
        const callId = item.rawItem?.callId || item.rawItem?.id

        if (callId) callIdToName.set(callId, toolName)
        toolCalls.push({ name: toolName, arguments: item.rawItem?.arguments || '{}' })
        report(`Consulting ${toolName}...`)
      } else if (item?.type === 'tool_call_output_item') {
        const toolName = item.rawItem?.name || callIdToName.get(item.rawItem?.callId) || UNKNOWN_TOOL
        report(`${toolName} completed`)
      }
    }

    await stream.completed

    lastResponseId = stream.lastResponseId
    unpersistedItems = previousResponseId ? stream.history : null
    return stream
  }

  await trackAgentRun(
    {
      channel: AGENT_CHANNEL_MCP,
      userId,
      nestedUsage,
      nestedToolCalls,
      failureReason: () => (textParts.join('').trim().length === 0 ? EMPTY_ANSWER_ERROR : null),
    },
    async () => {
      try {
        return await runTurn(conversation.previousResponseId)
      } catch (err) {
        if (!conversation.previousResponseId || textParts.length > 0) throw err

        console.error('Retrying the MCP turn without previousResponseId:', err.message)
        return runTurn(undefined)
      }
    }
  )

  return {
    answer: `${textParts.join('')}${buildSourcesFooter([...toolCalls, ...nestedToolCalls])}`,
    lastResponseId,
    unpersistedItems,
    skills,
  }
}
