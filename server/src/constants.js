export const MAX_INSTRUCTIONS_LENGTH = 50_000
export const MAX_DESCRIPTION_LENGTH = 200

export const SCHEDULE_HOURLY = 'hourly'
export const SCHEDULE_DAILY = 'daily'
export const SCHEDULE_WEEKLY = 'weekly'
export const SCHEDULE_MONTHLY = 'monthly'
export const SCHEDULE_FREQUENCIES = [SCHEDULE_HOURLY, SCHEDULE_DAILY, SCHEDULE_WEEKLY, SCHEDULE_MONTHLY]
export const SCHEDULE_MONTH_DAY_MAX = 28
export const SCHEDULE_QUESTION_MAX_LENGTH = 10_000
export const SCHEDULE_STATUS_OK = 'ok'
export const SCHEDULE_STATUS_ERROR = 'error'
export const MAX_SCHEDULES_PER_USER = 20

export const MAX_SOURCES = 50
export const MAX_SOURCE_LENGTH = 200
export const MAX_API_KEY_NAME_LENGTH = 80
export const MAX_API_KEYS_PER_USER = 20

export const DEFAULT_FILE_LINES = 300
export const MAX_FILE_LINES = 5000
export const DEFAULT_CONTEXT_LINES = 100
export const MAX_SEARCH_RESULTS = 100
export const DEFAULT_FIND_RESULTS = 50
export const MAX_FIND_RESULTS = 200

export const REASONING_EFFORT_LEVELS = ['low', 'medium', 'high']
export const DEFAULT_REASONING_EFFORT = 'medium'

export const AGENT_CHANNEL_WEB = 'web'
export const AGENT_CHANNEL_SLACK = 'slack'
export const AGENT_CHANNEL_SCHEDULE = 'schedule'
export const AGENT_CHANNEL_PR_REVIEW = 'pr_review'
export const AGENT_CHANNEL_PR_MENTION = 'pr_mention'
export const AGENT_CHANNEL_AUTO_DIAGNOSE = 'auto_diagnose'
export const RUN_STATUS_OK = 'ok'
export const RUN_STATUS_ERROR = 'error'
export const STATS_RANGE_ALL = 'all'
export const STATS_RANGE_HOURS = [1, 3, 24, 168, 720, 2160]
export const TOP_TOOLS_LIMIT = 10
