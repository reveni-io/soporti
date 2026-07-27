import { SCHEDULE_DAILY, SCHEDULE_HOURLY, SCHEDULE_MONTHLY, SCHEDULE_WEEKLY } from '../constants.js'

const MINUTE_MS = 60_000
const DAYS_PER_WEEK = 7

const FREQUENCY_STEPS = {
  [SCHEDULE_HOURLY]: { hours: 1 },
  [SCHEDULE_DAILY]: { days: 1 },
  [SCHEDULE_WEEKLY]: { days: DAYS_PER_WEEK },
  [SCHEDULE_MONTHLY]: { months: 1 },
}

function zonedParts(date, timezone) {
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

function shiftParts(parts, { hours = 0, days = 0, months = 0 } = {}) {
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

function offsetMs(date, timezone) {
  const parts = zonedParts(date, timezone)
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  return asIfUtc - Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS
}

function toInstant(parts, timezone) {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  const guess = new Date(naive - offsetMs(new Date(naive), timezone))
  return new Date(naive - offsetMs(guess, timezone))
}

function weekdayOf({ year, month, day }) {
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

export function computeNextRun(schedule, from = new Date()) {
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
