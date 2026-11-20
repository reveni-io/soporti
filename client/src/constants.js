export const YOLO_SOURCE = 'yolo'

export const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

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
  '.csv': 'text/csv',
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

export const SUBAGENT_NAME_MAX_LENGTH = 40
export const SUBAGENT_NAME_RE = new RegExp(`^[a-z][a-z0-9_]{1,${SUBAGENT_NAME_MAX_LENGTH - 1}}$`)
export const MAX_SUBAGENT_DESCRIPTION_LENGTH = 1000
export const SUBAGENT_TOOL_PREFIX = 'ask_'

export const JEV_SETTINGS_DOCUMENT = 'jev'

export const SCHEDULE_HOURLY = 'hourly'
export const SCHEDULE_DAILY = 'daily'
export const SCHEDULE_WEEKLY = 'weekly'
export const SCHEDULE_MONTHLY = 'monthly'
export const SCHEDULE_WEEKDAYS = 'weekdays'
export const SCHEDULE_ONCE = 'once'

export const SCHEDULE_FREQUENCY_OPTIONS = [
  { value: SCHEDULE_HOURLY, label: 'Hourly' },
  { value: SCHEDULE_DAILY, label: 'Daily' },
  { value: SCHEDULE_WEEKLY, label: 'Weekly' },
  { value: SCHEDULE_MONTHLY, label: 'Monthly' },
]

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const SCHEDULE_MONTH_DAY_MAX = 28
export const SCHEDULE_QUESTION_MAX_LENGTH = 150_000
export const SCHEDULE_STATUS_ERROR = 'error'

export const DEFAULT_PROFILE = 'support'

export const PROFILE_OPTIONS = [
  { id: 'support', label: 'Support', hint: 'Simplified explanations focused on behavior' },
  { id: 'tech', label: 'Tech', hint: 'Detailed code, architecture, and file paths' },
]

export const BOT_NAME_MAX_LENGTH = 50
export const BOT_DESCRIPTION_MAX_LENGTH = 1000

export const BOT_AVATAR_SHAPES = [
  { id: 'round', label: 'Round', position: 0.11 },
  { id: 'organic', label: 'Pebble', position: 0.35 },
  { id: 'boxy', label: 'Boxy', position: 0.54 },
  { id: 'capsule', label: 'Capsule', position: 0.65 },
  { id: 'nub', label: 'Bumpy', position: 0.745 },
  { id: 'cloud', label: 'Cloud', position: 0.825 },
  { id: 'droplet', label: 'Droplet', position: 0.8875 },
  { id: 'hexagon', label: 'Hexagon', position: 0.9325 },
  { id: 'sun', label: 'Sun', position: 0.965 },
  { id: 'triangle', label: 'Triangle', position: 0.99 },
]

export const BOT_AVATAR_COLORS = [
  { id: 'red', label: 'Red', hue: 25 },
  { id: 'orange', label: 'Orange', hue: 55 },
  { id: 'yellow', label: 'Yellow', hue: 90 },
  { id: 'lime', label: 'Lime', hue: 135 },
  { id: 'green', label: 'Green', hue: 160 },
  { id: 'teal', label: 'Teal', hue: 195 },
  { id: 'sky', label: 'Sky', hue: 235 },
  { id: 'blue', label: 'Blue', hue: 270 },
  { id: 'violet', label: 'Violet', hue: 305 },
  { id: 'pink', label: 'Pink', hue: 345 },
]

export const BOT_AVATAR_TONES = [
  { id: 'pastel', label: 'Pastel', position: 0.1 },
  { id: 'pale', label: 'Pale', position: 0.28 },
  { id: 'mid', label: 'Mid', position: 0.49 },
  { id: 'deep', label: 'Deep', position: 0.71 },
  { id: 'bright', label: 'Bright', position: 0.865 },
  { id: 'ink', label: 'Ink', position: 0.965 },
]

export const BOT_AVATAR_MOODS = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'happy', label: 'Happy' },
  { id: 'wink', label: 'Wink' },
  { id: 'smug', label: 'Smug' },
  { id: 'sleepy', label: 'Sleepy' },
  { id: 'surprised', label: 'Surprised' },
]

export const DEFAULT_BOT_AVATAR_MOOD = 'neutral'

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

export const SHARE_ID_RE = /^[a-f0-9]{32}$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const HUBSPOT_LEVEL_LABELS = { off: 'Off', read: 'Read', write: 'Write', full: 'Full', reply: 'Reply' }

export const VIDEO_STAGES = { DRAFTING: 'drafting', STORYBOARD: 'storyboard', PRODUCTION: 'production' }
export const ACTIVE_VIDEO_STATUSES = ['drafting', 'queued', 'running']
export const GENERATING_VIDEO_STATUSES = ['queued', 'running']
export const VIDEO_MAX_ATTACHMENTS = 5

export const ANALYTICS_STATUS = { GENERATING: 'generating', READY: 'ready', FAILED: 'failed' }
export const ANALYTICS_PROMPT_MAX_LENGTH = 2000
export const ANALYTICS_TITLE_MAX_LENGTH = 120
export const ANALYTICS_SQL_MAX_LENGTH = 20_000
export const ANALYTICS_DASHBOARD_NAME_MAX_LENGTH = 80

export const THEME = { LIGHT: 'light', DARK: 'dark' }
