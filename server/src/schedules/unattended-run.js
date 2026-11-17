import { run } from '@openai/agents'
import { resolveModelForAgent } from '../llm/model.js'
import { createAgent } from '../agent/assistant.js'
import { buildTurnLimitPrompt } from '../agent/system-prompt.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import config from '../config.js'
import { getCustomInstructions } from '../db/users.js'
import { toolCallsFromResult } from '../agent/run-items.js'
import { traceAgentRun, trackAgentRun } from '../agent/run-tracking.js'
import { AGENT_CHANNEL_SCHEDULE, EMPTY_ANSWER_ERROR, TOOL_NOT_FOUND_BEHAVIOR } from '../constants.js'

const WRAP_UP_TURNS = 1

function buildTurnLimitNotice(maxTurns) {
  return `\n\n---\n_Stopped at the turn limit of ${maxTurns} turns: some items may not have been handled._`
}

function extractText(result) {
  const output = result?.finalOutput
  if (typeof output === 'string') return output
  return output == null ? '' : JSON.stringify(output)
}

export function loadCustomInstructions(userId) {
  return getCustomInstructions(userId).catch(err => {
    console.error('[schedules] Failed to load custom instructions:', err.message)
    return null
  })
}

function buildWrapUp(agent, maxTurns, state) {
  return async function wrapUp({ context, runData }) {
    try {
      const { finalAnswerModelSettings } = await resolveModelForAgent()
      const wrapUpResult = await run(
        agent.clone({ modelSettings: finalAnswerModelSettings }),
        [...runData.history, { role: 'user', content: buildTurnLimitPrompt(maxTurns) }],
        { context, maxTurns: WRAP_UP_TURNS, toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR }
      )
      state.wrappedUp = true

      return { finalOutput: wrapUpResult.finalOutput }
    } catch (err) {
      console.error('[schedules] Failed to wrap up at the turn limit:', err)
      return undefined
    }
  }
}

export async function runUnattended(task, { session = undefined, conversationId = null } = {}) {
  const { sources, profile, userId, timezone, bot, customInstructions, input, question } = task
  const nestedToolCalls = []
  const nestedUsage = []

  const agent = await createAgent(sources, profile, {
    customInstructions: customInstructions ?? '',
    userId,
    onNestedToolCall: call => nestedToolCalls.push(call),
    onNestedUsage: usage => nestedUsage.push(usage),
    unattended: true,
    timezone,
    bot,
  })

  const { maxTurns } = config.schedules
  const state = { wrappedUp: false }

  const { result } = await trackAgentRun(
    {
      channel: AGENT_CHANNEL_SCHEDULE,
      userId,
      nestedUsage,
      nestedToolCalls,
      failureReason: runResult => (extractText(runResult).trim().length === 0 ? EMPTY_ANSWER_ERROR : null),
    },
    () => {
      return traceAgentRun({ sessionId: conversationId, userId, question }, () =>
        run(agent, input, {
          maxTurns,
          session,
          toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR,
          errorHandlers: { maxTurns: buildWrapUp(agent, maxTurns, state) },
        })
      )
    }
  )

  const answer = extractText(result)
  const footer = isYoloMode(sources) ? buildSourcesFooter([...toolCallsFromResult(result), ...nestedToolCalls]) : ''
  const notice = state.wrappedUp ? buildTurnLimitNotice(maxTurns) : ''

  return { result, answer, text: `${answer}${notice}${footer}`, wrappedUp: state.wrappedUp }
}
