import { run } from '@openai/agents'
import { resolveModelForAgent } from '../llm/model.js'
import { createAgent } from '../agent/assistant.js'
import { buildTurnLimitPrompt } from '../agent/system-prompt.js'
import { buildUserTurn } from '../agent/user-turn.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import config from '../config.js'
import { getCustomInstructions } from '../db/users.js'
import { searchSimilarCases } from '../knowledge/client.js'
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

export async function runSchedule(schedule, conversationStore) {
  const sources = Array.isArray(schedule.sources) ? schedule.sources : []
  const { conversationId, session } = await conversationStore.createScheduled(schedule.userId, schedule.id)

  try {
    const [similarCases, customInstructions] = await Promise.all([
      searchSimilarCases(schedule.question),
      getCustomInstructions(schedule.userId).catch(err => {
        console.error('[schedules] Failed to load custom instructions:', err.message)
        return null
      }),
    ])

    const nestedToolCalls = []
    const nestedUsage = []

    const agent = await createAgent(sources, schedule.profile, {
      customInstructions: customInstructions ?? '',
      userId: schedule.userId,
      onNestedToolCall: call => nestedToolCalls.push(call),
      onNestedUsage: usage => nestedUsage.push(usage),
      unattended: true,
      timezone: schedule.timezone,
    })
    const agentInput = buildUserTurn(schedule.question, { similarCases })

    const { maxTurns } = config.schedules
    let wrappedUp = false

    async function wrapUp({ context, runData }) {
      try {
        const { finalAnswerModelSettings } = await resolveModelForAgent()
        const wrapUpResult = await run(
          agent.clone({ modelSettings: finalAnswerModelSettings }),
          [...runData.history, { role: 'user', content: buildTurnLimitPrompt(maxTurns) }],
          { context, maxTurns: WRAP_UP_TURNS, toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR }
        )
        wrappedUp = true

        return { finalOutput: wrapUpResult.finalOutput }
      } catch (err) {
        console.error('[schedules] Failed to wrap up at the turn limit:', err)
        return undefined
      }
    }

    const { result } = await trackAgentRun(
      {
        channel: AGENT_CHANNEL_SCHEDULE,
        userId: schedule.userId,
        nestedUsage,
        nestedToolCalls,
        failureReason: runResult => (extractText(runResult).trim().length === 0 ? EMPTY_ANSWER_ERROR : null),
      },
      () =>
        traceAgentRun({ sessionId: conversationId, userId: schedule.userId, question: schedule.question }, () =>
          run(agent, agentInput, {
            maxTurns,
            session,
            toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR,
            errorHandlers: { maxTurns: wrapUp },
          })
        )
    )

    const answer = extractText(result)
    const footer = isYoloMode(sources) ? buildSourcesFooter([...toolCallsFromResult(result), ...nestedToolCalls]) : ''

    const notice = wrappedUp ? buildTurnLimitNotice(maxTurns) : ''

    await conversationStore.saveTurn(conversationId, {
      lastResponseId: wrappedUp ? null : result?.lastResponseId,
      session,
      uiMessages: [
        { role: 'user', parts: [{ type: 'text', content: schedule.question }] },
        { role: 'assistant', parts: [{ type: 'text', content: `${answer}${notice}${footer}` }] },
      ],
    })

    return { conversationId }
  } catch (err) {
    await conversationStore.deleteWeb(conversationId, schedule.userId).catch(deleteErr => {
      console.error('[schedules] Failed to clean up a failed run:', deleteErr.message)
    })
    throw err
  }
}
