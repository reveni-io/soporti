import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@openai/agents', () => ({
  tool: vi.fn(options => options),
}))

vi.mock('../db/routines.js', () => ({
  countRoutines: vi.fn(),
  createRoutine: vi.fn(),
  deleteRoutine: vi.fn(),
  getRoutine: vi.fn(),
  listRoutines: vi.fn(),
  updateRoutine: vi.fn(),
}))

const { countRoutines, createRoutine, deleteRoutine, getRoutine, listRoutines, updateRoutine } =
  await import('../db/routines.js')
const { buildRoutineTools } = await import('./routine-tools.js')

const NOW = new Date('2026-11-17T10:00:00Z')
const SCOPE = { botId: 4, userId: 7 }
const CONTEXT = { ...SCOPE, timezone: 'Europe/Madrid', profile: 'tech' }

const CREATE_INPUT = {
  title: 'Ticket triage',
  instruction: 'Review the new Zendesk tickets and tag the urgent ones.',
  frequency: 'weekdays',
  minute: 0,
  hour: 17,
  weekday: null,
  monthDay: null,
  date: null,
}

const STORED_ROUTINE = {
  id: 9,
  title: 'Ticket triage',
  instruction: 'Review the new Zendesk tickets and tag the urgent ones.',
  frequency: 'weekdays',
  minute: 0,
  hour: 17,
  weekday: null,
  monthDay: null,
  runDate: null,
  timezone: 'Europe/Madrid',
  paused: false,
  nextRunAt: new Date('2026-11-17T16:00:00Z'),
  lastRunAt: new Date('2026-11-16T16:00:00Z'),
  lastStatus: 'ok',
}

const UPDATE_NOTHING = {
  title: null,
  instruction: null,
  frequency: null,
  minute: null,
  hour: null,
  weekday: null,
  monthDay: null,
  date: null,
  paused: null,
}

function findTool(name) {
  return buildRoutineTools(CONTEXT).find(candidate => candidate.name === name)
}

async function execute(name, input) {
  return JSON.parse(await findTool(name).execute(input))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  countRoutines.mockResolvedValue(0)
  createRoutine.mockImplementation(async (_scope, routine) => ({ id: 9, ...routine }))
  updateRoutine.mockImplementation(async (id, _scope, routine) => ({ id, ...routine }))
  getRoutine.mockResolvedValue(STORED_ROUTINE)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildRoutineTools', () => {
  it('builds the four routine tools', () => {
    expect(buildRoutineTools(CONTEXT).map(candidate => candidate.name)).toEqual([
      'create_routine',
      'list_routines',
      'update_routine',
      'delete_routine',
    ])
  })

  describe('create_routine', () => {
    it('stores a yolo routine with the bot profile and the user time zone, and reports its next run', async () => {
      const result = await execute('create_routine', CREATE_INPUT)

      expect(createRoutine).toHaveBeenCalledTimes(1)
      expect(createRoutine).toHaveBeenCalledWith(SCOPE, {
        title: 'Ticket triage',
        instruction: 'Review the new Zendesk tickets and tag the urgent ones.',
        frequency: 'weekdays',
        minute: 0,
        hour: 17,
        weekday: null,
        monthDay: null,
        runDate: null,
        timezone: 'Europe/Madrid',
        sources: ['yolo'],
        profile: 'tech',
        paused: false,
        nextRunAt: new Date('2026-11-17T16:00:00Z'),
      })
      expect(result).toEqual({
        id: 9,
        title: 'Ticket triage',
        schedule: 'every weekday at 17:00 (Europe/Madrid)',
        paused: false,
        nextRun: 'Tuesday 2026-11-17 at 17:00 (Europe/Madrid)',
      })
    })

    it('stores a one-off routine at its instant', async () => {
      const result = await execute('create_routine', {
        ...CREATE_INPUT,
        title: 'Call reminder',
        frequency: 'once',
        hour: 9,
        date: '2026-11-20',
      })

      expect(createRoutine.mock.calls[0][1]).toMatchObject({
        frequency: 'once',
        runDate: '2026-11-20',
        nextRunAt: new Date('2026-11-20T08:00:00Z'),
      })
      expect(result.schedule).toBe('once on 2026-11-20 at 09:00 (Europe/Madrid)')
    })

    it('explains what is wrong instead of storing an invalid routine', async () => {
      const result = await execute('create_routine', { ...CREATE_INPUT, frequency: 'once', date: '2026-11-01' })

      expect(result).toEqual({ error: 'A one-off routine must be set for a date and time in the future.' })
      expect(createRoutine).not.toHaveBeenCalled()
    })

    it('refuses a routine past the limit of the bot', async () => {
      countRoutines.mockResolvedValue(10)

      const result = await execute('create_routine', CREATE_INPUT)

      expect(result.error).toMatch(/already has 10 routines/)
      expect(countRoutines).toHaveBeenCalledWith(SCOPE)
      expect(createRoutine).not.toHaveBeenCalled()
    })
  })

  describe('list_routines', () => {
    it('lists the routines of the bot with their schedule, next run and last run in words', async () => {
      listRoutines.mockResolvedValue([STORED_ROUTINE, { ...STORED_ROUTINE, id: 10, paused: true, lastRunAt: null }])

      const result = await execute('list_routines', {})

      expect(listRoutines).toHaveBeenCalledWith(SCOPE)
      expect(result).toEqual([
        {
          id: 9,
          title: 'Ticket triage',
          instruction: 'Review the new Zendesk tickets and tag the urgent ones.',
          schedule: 'every weekday at 17:00 (Europe/Madrid)',
          paused: false,
          nextRun: 'Tuesday 2026-11-17 at 17:00 (Europe/Madrid)',
          lastRun: 'Monday 2026-11-16 at 17:00 (Europe/Madrid)',
          lastStatus: 'ok',
        },
        expect.objectContaining({ id: 10, paused: true, nextRun: null, lastRun: null }),
      ])
    })
  })

  describe('update_routine', () => {
    it('changes only the fields that were given and recomputes the next run', async () => {
      const result = await execute('update_routine', { ...UPDATE_NOTHING, id: 9, hour: 9, frequency: 'daily' })

      expect(getRoutine).toHaveBeenCalledWith(9, SCOPE)
      expect(updateRoutine).toHaveBeenCalledTimes(1)
      expect(updateRoutine).toHaveBeenCalledWith(9, SCOPE, {
        title: 'Ticket triage',
        instruction: 'Review the new Zendesk tickets and tag the urgent ones.',
        frequency: 'daily',
        minute: 0,
        hour: 9,
        weekday: null,
        monthDay: null,
        runDate: null,
        timezone: 'Europe/Madrid',
        paused: false,
        nextRunAt: new Date('2026-11-18T08:00:00Z'),
      })
      expect(result).toMatchObject({ id: 9, schedule: 'every day at 09:00 (Europe/Madrid)' })
    })

    it('pauses a routine and reports no next run', async () => {
      const result = await execute('update_routine', { ...UPDATE_NOTHING, id: 9, paused: true })

      expect(updateRoutine.mock.calls[0][2].paused).toBe(true)
      expect(result).toMatchObject({ id: 9, paused: true, nextRun: null })
    })

    it('keeps the date of a one-off routine when it is not given again', async () => {
      getRoutine.mockResolvedValue({ ...STORED_ROUTINE, frequency: 'once', hour: 9, runDate: '2026-11-20' })

      await execute('update_routine', { ...UPDATE_NOTHING, id: 9, title: 'Call Ana' })

      expect(updateRoutine.mock.calls[0][2]).toMatchObject({ title: 'Call Ana', runDate: '2026-11-20' })
    })

    it('explains what is wrong with the change', async () => {
      const result = await execute('update_routine', { ...UPDATE_NOTHING, id: 9, frequency: 'once' })

      expect(result).toEqual({ error: 'A one-off routine needs a date written as YYYY-MM-DD.' })
      expect(updateRoutine).not.toHaveBeenCalled()
    })

    it('reports a routine that is not one of the bot', async () => {
      getRoutine.mockResolvedValue(null)

      const result = await execute('update_routine', { ...UPDATE_NOTHING, id: 99 })

      expect(result).toEqual({ error: 'No routine with id 99. Call list_routines for the ids.' })
      expect(updateRoutine).not.toHaveBeenCalled()
    })

    it('reports a routine deleted while it was being changed', async () => {
      updateRoutine.mockResolvedValue(null)

      const result = await execute('update_routine', { ...UPDATE_NOTHING, id: 9, title: 'Renamed' })

      expect(result).toEqual({ error: 'No routine with id 9. Call list_routines for the ids.' })
    })
  })

  describe('delete_routine', () => {
    it('deletes a routine of the bot', async () => {
      deleteRoutine.mockResolvedValue(true)

      expect(await execute('delete_routine', { id: 9 })).toEqual({ id: 9, deleted: true })
      expect(deleteRoutine).toHaveBeenCalledWith(9, SCOPE)
    })

    it('reports a routine that is not one of the bot', async () => {
      deleteRoutine.mockResolvedValue(false)

      expect(await execute('delete_routine', { id: 99 })).toEqual({
        error: 'No routine with id 99. Call list_routines for the ids.',
      })
    })
  })
})
