import { buildUserTurn } from '../agent/user-turn.js'
import { deleteLegalCases } from '../db/legal-cases.js'
import { toGuardPart } from '../guards/check.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { loadCustomInstructions, runUnattended } from './unattended-run.js'

export async function runSchedule(schedule, conversationStore) {
  const sources = Array.isArray(schedule.sources) ? schedule.sources : []
  const { conversationId, session } = await conversationStore.createScheduled(schedule.userId, schedule.id)
  const guardParts = []
  const guardCases = { conversationId, onChecked: result => guardParts.push(toGuardPart(result)) }

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
      { session, conversationId, guardCases }
    )

    await conversationStore.saveTurn(conversationId, {
      lastResponseId: wrappedUp ? null : result?.lastResponseId,
      session,
      uiMessages: [
        { role: 'user', parts: [{ type: 'text', content: schedule.question }] },
        { role: 'assistant', parts: [{ type: 'text', content: text }, ...guardParts] },
      ],
    })

    return { conversationId }
  } catch (err) {
    await discardRun(conversationStore, { conversationId, userId: schedule.userId })
    throw err
  }
}

async function discardRun(conversationStore, { conversationId, userId }) {
  try {
    await deleteLegalCases(conversationId)
    await conversationStore.deleteWeb(conversationId, userId)
  } catch (cleanupErr) {
    console.error('[schedules] Failed to clean up a failed run:', cleanupErr.message)
  }
}
