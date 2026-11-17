import { z } from 'zod'
import { tool } from '@openai/agents'
import { MAX_ROUTINES_PER_BOT, ROUTINE_FREQUENCIES } from '../constants.js'
import { countRoutines, createRoutine, deleteRoutine, getRoutine, listRoutines, updateRoutine } from '../db/routines.js'
import { describeRoutineSchedule, describeRunTime, parseRoutineInput } from '../bots/routines.js'
import { computeNextRun } from '../schedules/next-run.js'
import { YOLO_SOURCE } from './sources.js'

const TITLE_PARAM = z.string().describe('A short title of a few words that says what the routine does.')
const INSTRUCTION_PARAM = z
  .string()
  .describe(
    'What to do on every run, written to be read on its own: a run never sees this chat, only this instruction and its previous report. Say what to check, where, with which filters, what to do and how to report it.'
  )
const FREQUENCY_PARAM = z
  .enum(ROUTINE_FREQUENCIES)
  .describe(
    '`hourly`, `daily`, `weekdays` (Monday to Friday), `weekly`, `monthly`, or `once` for a single run on `date`.'
  )
const MINUTE_PARAM = z.number().int().describe('Minute of the hour, 0 to 59.')
const HOUR_PARAM = z
  .number()
  .int()
  .nullable()
  .describe("Hour of the day in the user's time zone, 0 to 23. Null only for hourly.")
const WEEKDAY_PARAM = z
  .number()
  .int()
  .nullable()
  .describe('Day of the week for weekly, from 0 (Sunday) to 6 (Saturday). Null for any other frequency.')
const MONTH_DAY_PARAM = z
  .number()
  .int()
  .nullable()
  .describe('Day of the month for monthly, 1 to 28. Null for any other frequency.')
const DATE_PARAM = z
  .string()
  .nullable()
  .describe("Day of a once routine as YYYY-MM-DD, in the user's time zone. Null for any other frequency.")
const ROUTINE_ID_PARAM = z.number().int().describe('The routine id, from list_routines.')

const MERGEABLE_FIELDS = ['title', 'instruction', 'frequency', 'minute', 'hour', 'weekday', 'monthDay', 'date']

function errorResult(error) {
  return JSON.stringify({ error })
}

function notFound(id) {
  return errorResult(`No routine with id ${id}. Call list_routines for the ids.`)
}

function describeRoutine(routine) {
  return {
    id: routine.id,
    title: routine.title,
    schedule: describeRoutineSchedule(routine),
    paused: routine.paused,
    nextRun: routine.paused ? null : describeRunTime(routine.nextRunAt, routine.timezone),
  }
}

function describeListedRoutine(routine) {
  return {
    ...describeRoutine(routine),
    instruction: routine.instruction,
    lastRun: routine.lastRunAt ? describeRunTime(routine.lastRunAt, routine.timezone) : null,
    lastStatus: routine.lastStatus,
  }
}

function mergeRoutineInput(routine, input) {
  const current = { ...routine, date: routine.runDate }
  const changes = MERGEABLE_FIELDS.filter(field => input[field] !== null && input[field] !== undefined)

  return { ...current, ...Object.fromEntries(changes.map(field => [field, input[field]])) }
}

async function createRoutineFromInput(input, { scope, timezone, profile }) {
  const parsed = parseRoutineInput(input, { timezone })
  if (parsed.error) return errorResult(parsed.error)

  if ((await countRoutines(scope)) >= MAX_ROUTINES_PER_BOT) {
    return errorResult(`This bot already has ${MAX_ROUTINES_PER_BOT} routines, the most it can have. Delete one first.`)
  }

  const routine = await createRoutine(scope, {
    ...parsed.value,
    sources: [YOLO_SOURCE],
    profile,
    paused: false,
    nextRunAt: computeNextRun(parsed.value),
  })

  return JSON.stringify(describeRoutine(routine))
}

async function updateRoutineFromInput(input, { scope, timezone }) {
  const routine = await getRoutine(input.id, scope)
  if (!routine) return notFound(input.id)

  const parsed = parseRoutineInput(mergeRoutineInput(routine, input), { timezone })
  if (parsed.error) return errorResult(parsed.error)

  const updated = await updateRoutine(input.id, scope, {
    ...parsed.value,
    paused: input.paused ?? routine.paused,
    nextRunAt: computeNextRun(parsed.value),
  })
  if (!updated) return notFound(input.id)

  return JSON.stringify(describeRoutine(updated))
}

export function buildRoutineTools({ botId, userId, timezone, profile }) {
  const scope = { botId, userId }

  return [
    tool({
      name: 'create_routine',
      description:
        "Create a routine: an instruction that runs on its own on a schedule, whose report is posted into this chat. Call it directly whenever the user asks for something recurring or at a given time. Times are in the user's time zone. Returns the routine with its schedule in words and its next run.",
      parameters: z.object({
        title: TITLE_PARAM,
        instruction: INSTRUCTION_PARAM,
        frequency: FREQUENCY_PARAM,
        minute: MINUTE_PARAM,
        hour: HOUR_PARAM,
        weekday: WEEKDAY_PARAM,
        monthDay: MONTH_DAY_PARAM,
        date: DATE_PARAM,
      }),
      execute: async input => createRoutineFromInput(input, { scope, timezone, profile }),
    }),
    tool({
      name: 'list_routines',
      description:
        'List the routines of this bot with their id, title, instruction, schedule in words, whether they are paused, their next run, and when and how the last run went.',
      parameters: z.object({}),
      execute: async () => {
        const routines = await listRoutines(scope)
        return JSON.stringify(routines.map(describeListedRoutine))
      },
    }),
    tool({
      name: 'update_routine',
      description:
        "Change a routine, pause it or resume it. Every field left null keeps its current value, so pass only what changes. Times are in the user's time zone. Returns the routine with its schedule in words and its next run.",
      parameters: z.object({
        id: ROUTINE_ID_PARAM,
        title: z.string().nullable().describe('New title, or null to keep it.'),
        instruction: z
          .string()
          .nullable()
          .describe('New instruction, self-contained like when creating it, or null to keep it.'),
        frequency: z.enum(ROUTINE_FREQUENCIES).nullable().describe('New frequency, or null to keep it.'),
        minute: z.number().int().nullable().describe('New minute of the hour, 0 to 59, or null to keep it.'),
        hour: z.number().int().nullable().describe('New hour of the day, 0 to 23, or null to keep it.'),
        weekday: z
          .number()
          .int()
          .nullable()
          .describe('New day of the week for weekly, 0 (Sunday) to 6 (Saturday), or null to keep it.'),
        monthDay: z
          .number()
          .int()
          .nullable()
          .describe('New day of the month for monthly, 1 to 28, or null to keep it.'),
        date: z.string().nullable().describe('New day of a once routine as YYYY-MM-DD, or null to keep it.'),
        paused: z.boolean().nullable().describe('True pauses the routine, false resumes it, null leaves it as it is.'),
      }),
      execute: async input => updateRoutineFromInput(input, { scope, timezone }),
    }),
    tool({
      name: 'delete_routine',
      description: 'Delete a routine for good. Call list_routines first for its id.',
      parameters: z.object({ id: ROUTINE_ID_PARAM }),
      execute: async input => {
        const removed = await deleteRoutine(input.id, scope)
        if (!removed) return notFound(input.id)

        return JSON.stringify({ id: input.id, deleted: true })
      },
    }),
  ]
}
