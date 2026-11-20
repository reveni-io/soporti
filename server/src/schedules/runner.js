import { buildUserTurn } from '../agent/user-turn.js'
import { deleteLegalCases } from '../db/legal-cases.js'
import { toGuardPart } from '../guards/check.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { conversationTarget, notifyUser } from '../push/notify.js'
import { loadCustomInstructions, runUnattended } from './unattended-run.js'

const DEFAULT_NOTIFICATION_TITLE = 'Scheduled question'

async function answerSchedule(schedule, conversationStore, { conversationId, session }) {
  const sources = Array.isArray(schedule.sources) ? schedule.sources : []
  const guardParts = []
  const guardCases = { conversationId, onChecked: result => guardParts.push(toGuardPart(result)) }

  try {
    const [similarCases, customInstructions] = await Promise.all([
      searchSimilarCases(schedule.question),
      loadCustomInstructions(schedule.userId),
    ])

    const { result, answer, text, wrappedUp } = await runUnattended(
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

    return answer
  } catch (err) {
    await discardRun(conversationStore, { conversationId, userId: schedule.userId })
    throw err
  }
}

export async function runSchedule(schedule, conversationStore) {
  const conversation = await conversationStore.createScheduled(schedule.userId, schedule.id)
  const answer = await answerSchedule(schedule, conversationStore, conversation)

  await notifyUser(schedule.userId, {
    title: schedule.title || DEFAULT_NOTIFICATION_TITLE,
    body: answer,
    ...conversationTarget(conversation.conversationId),
  })

  return { conversationId: conversation.conversationId }
}

async function discardRun(conversationStore, { conversationId, userId }) {
  try {
    await deleteLegalCases(conversationId)
    await conversationStore.deleteWeb(conversationId, userId)
  } catch (cleanupErr) {
    console.error('[schedules] Failed to clean up a failed run:', cleanupErr.message)
  }
}
