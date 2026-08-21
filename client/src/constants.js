export const YOLO_SOURCE = 'yolo'

export const QUESTION_PARAM = 'q'

const SKILL_NAME_CHARS = '[a-z0-9-]'

export const SKILL_NAME_MAX_LENGTH = 50
export const SKILL_NAME_RE = new RegExp(`^${SKILL_NAME_CHARS}{1,${SKILL_NAME_MAX_LENGTH}}$`)
export const SKILL_COMMAND_RE = new RegExp(`^/(${SKILL_NAME_CHARS}*)(\\s[\\s\\S]*)?$`)

export const MAX_ATTACHMENTS = 3
export const MAX_ATTACHMENT_MB = 10
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024

const DOCUMENT_MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export const ATTACHMENT_MIME_TYPES = { ...DOCUMENT_MIME_TYPES, ...IMAGE_MIME_TYPES }

export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_MIME_TYPES).join(',')

export const IMAGE_RETENTION_DAYS = 30

export const THUMBNAIL_MAX_PIXELS = 96
export const THUMBNAIL_MIME_TYPE = 'image/webp'
export const THUMBNAIL_QUALITY = 0.7

export const MAX_IMAGE_MB = 7
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024
export const IMAGE_MAX_PIXELS = 8000
export const SHRINK_MIME_TYPE = 'image/webp'
export const SHRINK_QUALITY = 0.85
export const SHRINK_STEP = 0.75
export const SHRINK_ATTEMPTS = 6

export const PAPERCLIP_GLYPH = '\u{1F4CE}'

export const MAX_DESCRIPTION_LENGTH = 200
export const MAX_INSTRUCTIONS_LENGTH = 50_000
export const MAX_API_KEY_NAME_LENGTH = 80

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
