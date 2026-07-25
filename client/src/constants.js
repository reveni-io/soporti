export const YOLO_SOURCE = 'yolo'

const SKILL_NAME_CHARS = '[a-z0-9-]'

export const SKILL_NAME_MAX_LENGTH = 50
export const SKILL_NAME_RE = new RegExp(`^${SKILL_NAME_CHARS}{1,${SKILL_NAME_MAX_LENGTH}}$`)
export const SKILL_COMMAND_RE = new RegExp(`^/(${SKILL_NAME_CHARS}*)(\\s[\\s\\S]*)?$`)

export const MAX_DESCRIPTION_LENGTH = 200
export const MAX_INSTRUCTIONS_LENGTH = 50_000
