import {
  ROUTINE_FREQUENCIES,
  ROUTINE_INSTRUCTION_MAX_LENGTH,
  ROUTINE_TITLE_MAX_LENGTH,
  SCHEDULE_DAILY,
  SCHEDULE_HOURLY,
  SCHEDULE_MONTHLY,
  SCHEDULE_ONCE,
  SCHEDULE_WEEKDAYS,
  SCHEDULE_WEEKLY,
} from '../constants.js'
import { describeInstant } from '../agent/clock.js'
import { computeNextRun } from '../schedules/next-run.js'
import { parseScheduleTiming } from '../schedules/timing.js'
import { parseRequiredText } from './input.js'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function pad(value) {
  return String(value).padStart(2, '0')
}

function timeOf(routine) {
  return `${pad(routine.hour)}:${pad(routine.minute)}`
}

const SCHEDULE_DESCRIPTIONS = {
  [SCHEDULE_HOURLY]: routine => `every hour at :${pad(routine.minute)}`,
  [SCHEDULE_DAILY]: routine => `every day at ${timeOf(routine)}`,
  [SCHEDULE_WEEKDAYS]: routine => `every weekday at ${timeOf(routine)}`,
  [SCHEDULE_WEEKLY]: routine => `every ${WEEKDAY_NAMES[routine.weekday]} at ${timeOf(routine)}`,
  [SCHEDULE_MONTHLY]: routine => `on day ${routine.monthDay} of every month at ${timeOf(routine)}`,
  [SCHEDULE_ONCE]: routine => `once on ${routine.runDate} at ${timeOf(routine)}`,
}

export function describeRoutineSchedule(routine) {
  return `${SCHEDULE_DESCRIPTIONS[routine.frequency](routine)} (${routine.timezone})`
}

export function describeRunTime(instant, timezone) {
  const { weekday, local } = describeInstant(new Date(instant), timezone)

  return `${weekday} ${local.slice(0, 10)} at ${local.slice(11, 16)} (${timezone})`
}

function isCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function parseRunDate(frequency, date) {
  if (frequency !== SCHEDULE_ONCE) return { value: null }

  const match = DATE_RE.exec(typeof date === 'string' ? date : '')
  if (!match) return { error: 'A one-off routine needs a date written as YYYY-MM-DD.' }

  const [year, month, day] = match.slice(1).map(Number)
  if (!isCalendarDate(year, month, day)) return { error: `${date} is not a valid calendar date.` }

  return { value: date }
}

export function parseRoutineInput(input, { timezone, now = new Date() }) {
  const { title, instruction, frequency, date } = input ?? {}

  const parsedTitle = parseRequiredText(title, { label: 'The title', maxLength: ROUTINE_TITLE_MAX_LENGTH })
  if (parsedTitle.error) return parsedTitle

  const parsedInstruction = parseRequiredText(instruction, {
    label: 'The instruction',
    maxLength: ROUTINE_INSTRUCTION_MAX_LENGTH,
  })
  if (parsedInstruction.error) return parsedInstruction

  if (!ROUTINE_FREQUENCIES.includes(frequency)) {
    return { error: `Frequency must be one of: ${ROUTINE_FREQUENCIES.join(', ')}.` }
  }

  const timing = parseScheduleTiming(input)
  if (timing.error) return timing

  const runDate = parseRunDate(frequency, date)
  if (runDate.error) return runDate

  const value = {
    title: parsedTitle.value,
    instruction: parsedInstruction.value,
    frequency,
    ...timing.value,
    runDate: runDate.value,
    timezone,
  }
  if (frequency === SCHEDULE_ONCE && computeNextRun(value, now) <= now) {
    return { error: 'A one-off routine must be set for a date and time in the future.' }
  }

  return { value }
}
