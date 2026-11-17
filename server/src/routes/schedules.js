import { Router } from 'express'
import { isSourceList } from '../agent/sources.js'
import { VALID_PROFILES } from '../agent/system-prompt.js'
import {
  MAX_SCHEDULES_PER_USER,
  MAX_SOURCES,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_QUESTION_MAX_LENGTH,
} from '../constants.js'
import { countSchedules, createSchedule, deleteSchedule, listSchedules, updateSchedule } from '../db/schedules.js'
import { computeNextRun, isValidTimezone } from '../schedules/next-run.js'
import { parseScheduleTiming } from '../schedules/timing.js'

const router = Router()

const ID_RE = /^\d{1,9}$/

function parseScheduleInput(body) {
  const { question, sources, profile, frequency, timezone } = body ?? {}

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

  const timing = parseScheduleTiming(body)
  if (timing.error) return timing

  if (!isValidTimezone(timezone)) {
    return { error: 'Timezone must be a valid IANA time zone name.' }
  }

  return { value: { question: question.trim(), sources, profile, frequency, ...timing.value, timezone } }
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

router.put('/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid schedule ID.' })

  const { error, value } = parseScheduleInput(req.body)
  if (error) return res.status(400).json({ error })

  try {
    const schedule = await updateSchedule(Number(req.params.id), req.user.id, {
      ...value,
      nextRunAt: computeNextRun(value),
    })
    if (!schedule) return res.status(404).json({ error: 'Scheduled query not found.' })
    res.json({ schedule })
  } catch (err) {
    console.error('Failed to update a schedule:', err)
    res.status(500).json({ error: 'Failed to update the scheduled query.' })
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
