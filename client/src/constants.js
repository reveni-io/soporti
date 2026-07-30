export const YOLO_SOURCE = 'yolo'

const SKILL_NAME_CHARS = '[a-z0-9-]'

export const SKILL_NAME_MAX_LENGTH = 50
export const SKILL_NAME_RE = new RegExp(`^${SKILL_NAME_CHARS}{1,${SKILL_NAME_MAX_LENGTH}}$`)
export const SKILL_COMMAND_RE = new RegExp(`^/(${SKILL_NAME_CHARS}*)(\\s[\\s\\S]*)?$`)

export const MAX_DESCRIPTION_LENGTH = 200
export const MAX_INSTRUCTIONS_LENGTH = 50_000

export const SCHEDULE_HOURLY = 'hourly'
export const SCHEDULE_DAILY = 'daily'
export const SCHEDULE_WEEKLY = 'weekly'
export const SCHEDULE_MONTHLY = 'monthly'

export const SCHEDULE_FREQUENCY_OPTIONS = [
  { value: SCHEDULE_HOURLY, label: 'Hourly' },
  { value: SCHEDULE_DAILY, label: 'Daily' },
  { value: SCHEDULE_WEEKLY, label: 'Weekly' },
  { value: SCHEDULE_MONTHLY, label: 'Monthly' },
]

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const SCHEDULE_MONTH_DAY_MAX = 28
export const SCHEDULE_QUESTION_MAX_LENGTH = 10_000
export const SCHEDULE_STATUS_ERROR = 'error'

export const EMPTY_CELL = '—'

export const STATS_RANGE_ALL = 'all'

export const STATS_RANGE_OPTIONS = [
  { value: '1', label: 'Last hour' },
  { value: '3', label: 'Last 3 hours' },
  { value: '24', label: 'Last 24 hours' },
  { value: '168', label: 'Last 7 days' },
  { value: '720', label: 'Last 30 days' },
  { value: '2160', label: 'Last 90 days' },
  { value: STATS_RANGE_ALL, label: 'All time' },
]
