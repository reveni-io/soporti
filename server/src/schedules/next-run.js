import {
  SCHEDULE_DAILY,
  SCHEDULE_HOURLY,
  SCHEDULE_MONTHLY,
  SCHEDULE_ONCE,
  SCHEDULE_WEEKDAYS,
  SCHEDULE_WEEKLY,
} from '../constants.js'

const MINUTE_MS = 60_000
const DAYS_PER_WEEK = 7
const WEEKEND_DAYS = new Set([0, 6])

const FREQUENCY_STEPS = {
  [SCHEDULE_HOURLY]: { hours: 1 },
  [SCHEDULE_DAILY]: { days: 1 },
  [SCHEDULE_WEEKLY]: { days: DAYS_PER_WEEK },
  [SCHEDULE_MONTHLY]: { months: 1 },
}

export function zonedParts(date, timezone) {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)

  const parts = {}
  for (const { type, value } of formatted) {
    if (type !== 'literal') parts[type] = Number(value)
  }
  return parts
}

export function shiftParts(parts, { hours = 0, days = 0, months = 0 } = {}) {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1 + months, parts.day + days, parts.hour + hours, parts.minute)
  )
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

export function offsetMs(date, timezone) {
  const parts = zonedParts(date, timezone)
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  return asIfUtc - Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS
}

export function toInstant(parts, timezone) {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  const guess = new Date(naive - offsetMs(new Date(naive), timezone))
  return new Date(naive - offsetMs(guess, timezone))
}

export function weekdayOf({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function targetParts(schedule, from) {
  const local = zonedParts(from, schedule.timezone)

  if (schedule.frequency === SCHEDULE_HOURLY) return { ...local, minute: schedule.minute }

  const atTime = { ...local, hour: schedule.hour, minute: schedule.minute }

  if (schedule.frequency === SCHEDULE_DAILY) return atTime
  if (schedule.frequency === SCHEDULE_WEEKLY) {
    return shiftParts(atTime, { days: (schedule.weekday - weekdayOf(atTime) + DAYS_PER_WEEK) % DAYS_PER_WEEK })
  }

  return { ...atTime, day: schedule.monthDay }
}

function parseRunDate(runDate) {
  const [year, month, day] = runDate.split('-').map(Number)

  return { year, month, day }
}

function computeOnceRun(schedule) {
  const parts = { ...parseRunDate(schedule.runDate), hour: schedule.hour, minute: schedule.minute }

  return toInstant(parts, schedule.timezone)
}

function isWorkingDayRunAfter(parts, timezone, from) {
  return !WEEKEND_DAYS.has(weekdayOf(parts)) && toInstant(parts, timezone) > from
}

function computeWeekdaysRun(schedule, from) {
  const today = { ...zonedParts(from, schedule.timezone), hour: schedule.hour, minute: schedule.minute }
  const candidates = Array.from({ length: DAYS_PER_WEEK }, (_, days) => shiftParts(today, { days }))
  const target = candidates.find(parts => isWorkingDayRunAfter(parts, schedule.timezone, from))

  return toInstant(target, schedule.timezone)
}

const SPECIAL_RUNS = {
  [SCHEDULE_ONCE]: computeOnceRun,
  [SCHEDULE_WEEKDAYS]: computeWeekdaysRun,
}

export function computeNextRun(schedule, from = new Date()) {
  const special = SPECIAL_RUNS[schedule.frequency]
  if (special) return special(schedule, from)

  const target = targetParts(schedule, from)
  const candidate = toInstant(target, schedule.timezone)

  if (candidate > from) return candidate

  return toInstant(shiftParts(target, FREQUENCY_STEPS[schedule.frequency]), schedule.timezone)
}

export function isValidTimezone(timezone) {
  if (typeof timezone !== 'string' || timezone.length === 0) return false

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}
