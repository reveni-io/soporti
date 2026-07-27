import { SCHEDULE_DAILY, SCHEDULE_HOURLY, SCHEDULE_WEEKLY, WEEKDAY_LABELS, YOLO_SOURCE } from '../../../constants.js'

function pad(value) {
  return String(value).padStart(2, '0')
}

export function describeSchedule({ frequency, hour, minute, weekday, monthDay }) {
  const time = `${pad(hour)}:${pad(minute)}`

  if (frequency === SCHEDULE_HOURLY) return `Hourly at :${pad(minute)}`
  if (frequency === SCHEDULE_DAILY) return `Daily at ${time}`
  if (frequency === SCHEDULE_WEEKLY) return `Weekly on ${WEEKDAY_LABELS[weekday]} at ${time}`

  return `Monthly on day ${monthDay} at ${time}`
}

export function describeSources(sources) {
  if (!sources || sources.length === 0) return 'no sources'
  if (sources.includes(YOLO_SOURCE)) return 'YOLO (auto)'

  return sources.join(', ')
}

export function formatRunTime(value) {
  if (!value) return ''

  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
