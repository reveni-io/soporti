import { NOTHING_TO_REPORT, ROUTINE_RESULT_MAX_LENGTH, SCHEDULE_ONCE } from '../constants.js'
import { YOLO_SOURCE } from '../agent/sources.js'
import { buildRoutineRunTurn } from '../agent/system-prompt.js'
import { getBot, incrementBotUnread } from '../db/bots.js'
import { storeRoutineResult } from '../db/routines.js'
import { botTarget, notifyUser } from '../push/notify.js'
import { loadCustomInstructions, runUnattended } from '../schedules/unattended-run.js'
import { appendToBotChat, buildBotTurnItems } from './bot-chat.js'
import { describeRoutineSchedule, describeRunTime } from './routines.js'

const SILENT_ANSWER_NOISE_RE = /[`'"*.,!?:;\s]/g
const RETRYING_FAILURE = 'I could not run this routine. I will try again at its next scheduled time.'
const ONE_OFF_FAILURE = 'I could not run this routine.'

function isNothingToReport(answer) {
  return answer.replace(SILENT_ANSWER_NOISE_RE, '') === NOTHING_TO_REPORT
}

function routinePart(schedule) {
  return { type: 'routine', routineId: schedule.id, title: schedule.title }
}

function buildRoutineInput(schedule) {
  return buildRoutineRunTurn({
    title: schedule.title,
    schedule: describeRoutineSchedule(schedule),
    instruction: schedule.question,
    previousReport: schedule.lastResult,
    previousRunAt: schedule.lastRunAt ? describeRunTime(schedule.lastRunAt, schedule.timezone) : null,
  })
}

function buildRoutineNote(schedule, startedAt) {
  const ranAt = describeRunTime(startedAt, schedule.timezone)

  return `[Routine "${schedule.title}" ran at ${ranAt}. Its instruction: ${schedule.question}]`
}

async function runRoutineAgent(schedule, bot, conversationId) {
  const customInstructions = await loadCustomInstructions(schedule.userId)

  return runUnattended(
    {
      sources: [YOLO_SOURCE],
      profile: bot.profile,
      userId: schedule.userId,
      timezone: schedule.timezone,
      bot: { name: bot.name, description: bot.description },
      customInstructions,
      input: buildRoutineInput(schedule),
      question: schedule.question,
    },
    { conversationId }
  )
}

async function reportFailure(conversationStore, conversation, schedule) {
  const content = schedule.frequency === SCHEDULE_ONCE ? ONE_OFF_FAILURE : RETRYING_FAILURE

  await appendToBotChat(conversationStore, conversation, {
    parts: [routinePart(schedule), { type: 'error', content }],
  })
  await incrementBotUnread(schedule.botId)
}

async function postAnswer(conversationStore, conversation, { schedule, outcome, startedAt }) {
  const report = outcome.answer.slice(0, ROUTINE_RESULT_MAX_LENGTH)

  await appendToBotChat(conversationStore, conversation, {
    parts: [routinePart(schedule), { type: 'text', content: outcome.text }],
    items: buildBotTurnItems(buildRoutineNote(schedule, startedAt), report),
  })
  await Promise.all([incrementBotUnread(schedule.botId), storeRoutineResult(schedule.id, report)])
}

function notifyOwner(schedule, bot, body) {
  return notifyUser(schedule.userId, { title: bot.name, body, ...botTarget(bot.id) })
}

async function runOrReportFailure(conversationStore, conversation, { schedule, bot }) {
  try {
    return await runRoutineAgent(schedule, bot, conversation.conversationId)
  } catch (err) {
    await reportFailure(conversationStore, conversation, schedule).catch(reportErr => {
      console.error('[bots] Failed to report a failed routine run in the chat:', reportErr)
    })
    await notifyOwner(schedule, bot, `The routine "${schedule.title}" could not run.`)
    throw err
  }
}

export async function runBotRoutine(schedule, conversationStore) {
  const bot = await getBot(schedule.botId, schedule.userId)
  if (!bot) throw new Error(`Bot ${schedule.botId} was not found.`)

  const startedAt = new Date()
  const conversation = await conversationStore.resolveBot(bot.id, schedule.userId)
  const outcome = await runOrReportFailure(conversationStore, conversation, { schedule, bot })
  if (isNothingToReport(outcome.answer)) return { posted: false }

  await postAnswer(conversationStore, conversation, { schedule, outcome, startedAt })
  await notifyOwner(schedule, bot, outcome.answer)

  return { posted: true }
}
