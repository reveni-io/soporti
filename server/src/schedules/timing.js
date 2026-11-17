import { SCHEDULE_HOURLY, SCHEDULE_MONTHLY, SCHEDULE_MONTH_DAY_MAX, SCHEDULE_WEEKLY } from '../constants.js'

const MINUTE_MAX = 59
const HOUR_MAX = 23
const WEEKDAY_MAX = 6

function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
}

function parseDayOfPeriod(frequency, { weekday, monthDay }) {
  if (frequency === SCHEDULE_WEEKLY) {
    if (!isIntegerInRange(weekday, 0, WEEKDAY_MAX)) {
      return { error: `Weekday must be an integer between 0 (Sunday) and ${WEEKDAY_MAX} (Saturday).` }
    }
    return { value: { weekday, monthDay: null } }
  }

  if (frequency === SCHEDULE_MONTHLY) {
    if (!isIntegerInRange(monthDay, 1, SCHEDULE_MONTH_DAY_MAX)) {
      return { error: `Day of the month must be an integer between 1 and ${SCHEDULE_MONTH_DAY_MAX}.` }
    }
    return { value: { weekday: null, monthDay } }
  }

  return { value: { weekday: null, monthDay: null } }
}

export function parseScheduleTiming({ frequency, minute, hour, weekday, monthDay }) {
  if (!isIntegerInRange(minute, 0, MINUTE_MAX)) {
    return { error: `Minute must be an integer between 0 and ${MINUTE_MAX}.` }
  }
  if (frequency === SCHEDULE_HOURLY) return { value: { minute, hour: null, weekday: null, monthDay: null } }

  if (!isIntegerInRange(hour, 0, HOUR_MAX)) {
    return { error: `Hour must be an integer between 0 and ${HOUR_MAX}.` }
  }

  const day = parseDayOfPeriod(frequency, { weekday, monthDay })
  if (day.error) return day

  return { value: { minute, hour, ...day.value } }
}
