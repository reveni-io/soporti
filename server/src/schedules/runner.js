import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import config from '../config.js'
import { getCustomInstructions } from '../db/users.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { toolCallsFromResult } from '../agent/run-items.js'
import { trackAgentRun } from '../agent/run-tracking.js'
import { AGENT_CHANNEL_SCHEDULE } from '../constants.js'

const EMPTY_ANSWER_ERROR = 'The assistant returned an empty answer.'

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

    const agent = await createAgent(sources, schedule.profile, similarCases, {
      customInstructions: customInstructions ?? '',
    })

    const { result } = await trackAgentRun(
      {
        channel: AGENT_CHANNEL_SCHEDULE,
        failureReason: runResult => (extractText(runResult).trim().length === 0 ? EMPTY_ANSWER_ERROR : null),
      },
      () => run(agent, schedule.question, { maxTurns: config.agent.maxIterations, session })
    )

    const answer = extractText(result)
    const footer = isYoloMode(sources) ? buildSourcesFooter(toolCallsFromResult(result)) : ''

    await conversationStore.saveTurn(conversationId, {
      lastResponseId: result?.lastResponseId,
      session,
      uiMessages: [
        { role: 'user', parts: [{ type: 'text', content: schedule.question }] },
        { role: 'assistant', parts: [{ type: 'text', content: `${answer}${footer}` }] },
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
