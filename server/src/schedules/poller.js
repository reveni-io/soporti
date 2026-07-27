import { SCHEDULE_STATUS_ERROR, SCHEDULE_STATUS_OK } from '../constants.js'
import { claimDueSchedules, markScheduleRun } from '../db/schedules.js'
import { isConfigured } from '../llm/model.js'
import { computeNextRun } from './next-run.js'
import { runSchedule } from './runner.js'

const POLL_INTERVAL_MS = 60_000
const MAX_RUNS_PER_TICK = 5
const MAX_STORED_ERROR_LENGTH = 500

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [schedules] ${icon}`, ...args)
}

let intervalHandle = null

export async function runPollOnce(conversationStore) {
  if (!(await isConfigured())) return { ran: 0 }

  const due = await claimDueSchedules(MAX_RUNS_PER_TICK, schedule => computeNextRun(schedule))
  let ran = 0

  for (const schedule of due) {
    try {
      log('🚀', `Running schedule ${schedule.id}: "${schedule.question.slice(0, 80)}"`)
      const { conversationId } = await runSchedule(schedule, conversationStore)
      await markScheduleRun(schedule.id, { status: SCHEDULE_STATUS_OK })
      ran++
      log('✅', `Schedule ${schedule.id} answered in conversation ${conversationId}`)
    } catch (err) {
      console.error(`[schedules] Failed to run schedule ${schedule.id}:`, err)
      await markScheduleRun(schedule.id, {
        status: SCHEDULE_STATUS_ERROR,
        error: err.message.slice(0, MAX_STORED_ERROR_LENGTH),
      }).catch(markErr => console.error('[schedules] Failed to store the run error:', markErr.message))
    }
  }

  return { ran }
}

export function startSchedulePoller(conversationStore) {
  if (intervalHandle) return intervalHandle

  const tick = () => {
    runPollOnce(conversationStore).catch(err => console.error('[schedules] Poll failed:', err.message))
  }

  intervalHandle = setInterval(tick, POLL_INTERVAL_MS)
  intervalHandle.unref?.()
  tick()

  return intervalHandle
}

export function stopSchedulePoller() {
  if (!intervalHandle) return

  clearInterval(intervalHandle)
  intervalHandle = null
}
