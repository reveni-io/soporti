import { buildUserTurn } from '../agent/user-turn.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { loadCustomInstructions, runUnattended } from './unattended-run.js'

export async function runSchedule(schedule, conversationStore) {
  const sources = Array.isArray(schedule.sources) ? schedule.sources : []
  const { conversationId, session } = await conversationStore.createScheduled(schedule.userId, schedule.id)

  try {
    const [similarCases, customInstructions] = await Promise.all([
      searchSimilarCases(schedule.question),
      loadCustomInstructions(schedule.userId),
    ])

    const { result, text, wrappedUp } = await runUnattended(
      {
        sources,
        profile: schedule.profile,
        userId: schedule.userId,
        timezone: schedule.timezone,
        customInstructions,
        input: buildUserTurn(schedule.question, { similarCases }),
        question: schedule.question,
      },
      { session, conversationId }
    )

    await conversationStore.saveTurn(conversationId, {
      lastResponseId: wrappedUp ? null : result?.lastResponseId,
      session,
      uiMessages: [
        { role: 'user', parts: [{ type: 'text', content: schedule.question }] },
        { role: 'assistant', parts: [{ type: 'text', content: text }] },
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
