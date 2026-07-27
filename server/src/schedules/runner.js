import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import config from '../config.js'
import { getCustomInstructions } from '../db/users.js'
import { searchSimilarCases } from '../knowledge/client.js'

function collectToolCalls(result) {
  return (result?.newItems ?? [])
    .filter(item => item?.type === 'tool_call_item')
    .map(item => ({ name: item.rawItem?.name, arguments: item.rawItem?.arguments }))
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

    const agent = await createAgent(sources, schedule.profile, similarCases, {
      customInstructions: customInstructions ?? '',
    })

    const result = await run(agent, schedule.question, { maxTurns: config.agent.maxIterations, session })

    const answer = extractText(result)
    if (answer.trim().length === 0) throw new Error('The assistant returned an empty answer.')

    const footer = isYoloMode(sources) ? buildSourcesFooter(collectToolCalls(result)) : ''

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
