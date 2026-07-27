import { Router } from 'express'
import { VALID_PROFILES } from '../agent/system-prompt.js'
import {
  MAX_SCHEDULES_PER_USER,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_HOURLY,
  SCHEDULE_MONTHLY,
  SCHEDULE_MONTH_DAY_MAX,
  SCHEDULE_QUESTION_MAX_LENGTH,
  SCHEDULE_WEEKLY,
} from '../constants.js'
import { countSchedules, createSchedule, deleteSchedule, listSchedules } from '../db/schedules.js'
import { computeNextRun, isValidTimezone } from '../schedules/next-run.js'

const router = Router()

const ID_RE = /^\d{1,9}$/
const MAX_SOURCES = 50
const MAX_SOURCE_LENGTH = 200
const MINUTE_MAX = 59
const HOUR_MAX = 23
const WEEKDAY_MAX = 6

function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
}

function isSourceList(sources) {
  if (!Array.isArray(sources) || sources.length > MAX_SOURCES) return false
  return sources.every(source => typeof source === 'string' && source.length > 0 && source.length <= MAX_SOURCE_LENGTH)
}

function parseScheduleInput(body) {
  const { question, sources, profile, frequency, minute, hour, weekday, monthDay, timezone } = body ?? {}

  if (typeof question !== 'string' || question.trim().length === 0) {
    return { error: 'A question is required.' }
  }
  if (question.length > SCHEDULE_QUESTION_MAX_LENGTH) {
    return { error: `The question is too long (max ${SCHEDULE_QUESTION_MAX_LENGTH} characters).` }
  }
  if (!isSourceList(sources)) {
    return { error: `Sources must be an array of up to ${MAX_SOURCES} source names.` }
  }
  if (!VALID_PROFILES.includes(profile)) {
    return { error: `Profile must be one of: ${VALID_PROFILES.join(', ')}.` }
  }
  if (!SCHEDULE_FREQUENCIES.includes(frequency)) {
    return { error: `Frequency must be one of: ${SCHEDULE_FREQUENCIES.join(', ')}.` }
  }
  if (!isIntegerInRange(minute, 0, MINUTE_MAX)) {
    return { error: `Minute must be an integer between 0 and ${MINUTE_MAX}.` }
  }
  if (!isValidTimezone(timezone)) {
    return { error: 'Timezone must be a valid IANA time zone name.' }
  }

  const value = {
    question: question.trim(),
    sources,
    profile,
    frequency,
    minute,
    hour: null,
    weekday: null,
    monthDay: null,
    timezone,
  }

  if (frequency === SCHEDULE_HOURLY) return { value }

  if (!isIntegerInRange(hour, 0, HOUR_MAX)) {
    return { error: `Hour must be an integer between 0 and ${HOUR_MAX}.` }
  }
  value.hour = hour

  if (frequency === SCHEDULE_WEEKLY) {
    if (!isIntegerInRange(weekday, 0, WEEKDAY_MAX)) {
      return { error: `Weekday must be an integer between 0 (Sunday) and ${WEEKDAY_MAX} (Saturday).` }
    }
    value.weekday = weekday
  }

  if (frequency === SCHEDULE_MONTHLY) {
    if (!isIntegerInRange(monthDay, 1, SCHEDULE_MONTH_DAY_MAX)) {
      return { error: `Day of the month must be an integer between 1 and ${SCHEDULE_MONTH_DAY_MAX}.` }
    }
    value.monthDay = monthDay
  }

  return { value }
}

router.get('/', async (req, res) => {
  try {
    res.json({ schedules: await listSchedules(req.user.id) })
  } catch (err) {
    console.error('Failed to list schedules:', err)
    res.status(500).json({ error: 'Failed to list the scheduled queries.' })
  }
})

router.post('/', async (req, res) => {
  const { error, value } = parseScheduleInput(req.body)
  if (error) return res.status(400).json({ error })

  try {
    if ((await countSchedules(req.user.id)) >= MAX_SCHEDULES_PER_USER) {
      return res.status(422).json({ error: `You can only have ${MAX_SCHEDULES_PER_USER} scheduled queries.` })
    }

    const schedule = await createSchedule(req.user.id, { ...value, nextRunAt: computeNextRun(value) })
    res.status(201).json({ schedule })
  } catch (err) {
    console.error('Failed to create a schedule:', err)
    res.status(500).json({ error: 'Failed to create the scheduled query.' })
  }
})

router.delete('/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid schedule ID.' })

  try {
    const removed = await deleteSchedule(Number(req.params.id), req.user.id)
    if (!removed) return res.status(404).json({ error: 'Scheduled query not found.' })
    res.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete a schedule:', err)
    res.status(500).json({ error: 'Failed to delete the scheduled query.' })
  }
})

export default router
