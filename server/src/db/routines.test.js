import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
}))

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: value => {
      call.steps.where = value
      return chain
    },
    orderBy: () => chain,
    limit: () => chain,
    set: value => {
      call.steps.set = value
      return chain
    },
    values: value => {
      call.steps.values = value
      return chain
    },
    returning: () => chain,
    then: (resolve, reject) => {
      const next = queue.shift()
      const promise = next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? [])
      return promise.then(resolve, reject)
    },
  }
  return chain
}

vi.mock('./index.js', () => ({
  getDb: () => ({
    select: () => makeChain('select'),
    insert: () => makeChain('insert'),
    update: () => makeChain('update'),
    delete: () => makeChain('delete'),
  }),
}))

const { schedules } = await import('./schema.js')
const {
  listRoutines,
  countRoutines,
  getRoutine,
  createRoutine,
  updateRoutine,
  setRoutinePaused,
  deleteRoutine,
  storeRoutineResult,
} = await import('./routines.js')

const SCOPE = { botId: 4, userId: 7 }
const OWNED_ROUTINES = {
  op: 'and',
  preds: [
    { op: 'eq', col: schedules.botId, val: 4 },
    { op: 'eq', col: schedules.userId, val: 7 },
  ],
}
const OWNED_ROUTINE = { op: 'and', preds: [{ op: 'eq', col: schedules.id, val: 9 }, OWNED_ROUTINES] }

const ROUTINE_INPUT = {
  title: 'Ticket triage',
  instruction: 'Review the new tickets.',
  frequency: 'weekdays',
  minute: 0,
  hour: 17,
  weekday: null,
  monthDay: null,
  runDate: null,
  timezone: 'Europe/Madrid',
  sources: ['yolo'],
  profile: 'support',
  paused: false,
  nextRunAt: new Date('2026-11-17T16:00:00Z'),
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('listRoutines', () => {
  it('returns the routines of the bot, scoped to its owner', async () => {
    const rows = [{ id: 9, title: 'Ticket triage' }]
    queue = [rows]

    expect(await listRoutines(SCOPE)).toEqual(rows)
    expect(calls[0].steps.where).toEqual(OWNED_ROUTINES)
  })
})

describe('countRoutines', () => {
  it('counts the routines of the bot, or 0 without a row', async () => {
    queue = [[{ total: 2 }], []]

    expect(await countRoutines(SCOPE)).toBe(2)
    expect(await countRoutines(SCOPE)).toBe(0)
    expect(calls[0].steps.where).toEqual(OWNED_ROUTINES)
  })
})

describe('getRoutine', () => {
  it('returns the routine when the bot and the user own it, or null', async () => {
    queue = [[{ id: 9 }], []]

    expect(await getRoutine(9, SCOPE)).toEqual({ id: 9 })
    expect(await getRoutine(9, SCOPE)).toBeNull()
    expect(calls[0].steps.where).toEqual(OWNED_ROUTINE)
  })
})

describe('createRoutine', () => {
  it('stores the instruction as the question of a schedule linked to the bot', async () => {
    queue = [[{ id: 9 }]]

    expect(await createRoutine(SCOPE, ROUTINE_INPUT)).toEqual({ id: 9 })

    const { instruction, ...rest } = ROUTINE_INPUT
    expect(calls[0].steps.values).toEqual({ ...rest, question: instruction, botId: 4, userId: 7 })
  })
})

describe('updateRoutine', () => {
  it('updates the owned routine, maps the instruction and stamps updatedAt', async () => {
    queue = [[{ id: 9 }]]

    expect(await updateRoutine(9, SCOPE, ROUTINE_INPUT)).toEqual({ id: 9 })
    expect(calls[0].steps.set).toMatchObject({ question: 'Review the new tickets.', hour: 17 })
    expect(calls[0].steps.set).not.toHaveProperty('instruction')
    expect(calls[0].steps.set.updatedAt).toBeInstanceOf(Date)
    expect(calls[0].steps.where).toEqual(OWNED_ROUTINE)
  })

  it('returns null when the routine is not owned', async () => {
    queue = [[]]

    expect(await updateRoutine(9, SCOPE, ROUTINE_INPUT)).toBeNull()
  })
})

describe('setRoutinePaused', () => {
  it('stores the paused flag and the next run of the owned routine', async () => {
    const nextRunAt = new Date('2026-11-18T16:00:00Z')
    queue = [[{ id: 9, paused: true }], []]

    expect(await setRoutinePaused(9, SCOPE, { paused: true, nextRunAt })).toEqual({ id: 9, paused: true })
    expect(await setRoutinePaused(9, SCOPE, { paused: true, nextRunAt })).toBeNull()
    expect(calls[0].steps.set).toMatchObject({ paused: true, nextRunAt })
    expect(calls[0].steps.where).toEqual(OWNED_ROUTINE)
  })
})

describe('deleteRoutine', () => {
  it('reports whether an owned routine was deleted', async () => {
    queue = [[{ id: 9 }], []]

    expect(await deleteRoutine(9, SCOPE)).toBe(true)
    expect(await deleteRoutine(9, SCOPE)).toBe(false)
    expect(calls[0].steps.where).toEqual(OWNED_ROUTINE)
  })
})

describe('storeRoutineResult', () => {
  it('stores the last report of the routine', async () => {
    queue = [[]]

    await storeRoutineResult(9, 'Three new tickets.')

    expect(calls[0].steps.set).toMatchObject({ lastResult: 'Three new tickets.' })
    expect(calls[0].steps.where).toEqual({ op: 'eq', col: schedules.id, val: 9 })
  })
})
