import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: value => {
      call.steps.limit = value
      return chain
    },
    for: (strength, config) => {
      call.steps.for = { strength, config }
      return chain
    },
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

const db = {
  select: () => makeChain('select'),
  insert: () => makeChain('insert'),
  update: () => makeChain('update'),
  delete: () => makeChain('delete'),
  transaction: callback => callback(db),
}

vi.mock('./index.js', () => ({ getDb: () => db }))

const { listSchedules, countSchedules, createSchedule, deleteSchedule, claimDueSchedules, markScheduleRun } =
  await import('./schedules.js')

const SCHEDULE_INPUT = {
  question: 'Failed payments in the last 24h',
  sources: ['yolo'],
  profile: 'support',
  frequency: 'daily',
  minute: 0,
  hour: 9,
  weekday: null,
  monthDay: null,
  timezone: 'Europe/Madrid',
  nextRunAt: new Date('2026-07-28T07:00:00Z'),
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('listSchedules', () => {
  it('returns the rows from the DB', async () => {
    const rows = [{ id: 1, question: 'Failed payments' }]
    queue = [rows]

    expect(await listSchedules(7)).toEqual(rows)
  })
})

describe('countSchedules', () => {
  it('returns the total', async () => {
    queue = [[{ total: 3 }]]

    expect(await countSchedules(7)).toBe(3)
  })

  it('returns 0 when the query yields no row', async () => {
    queue = [[]]

    expect(await countSchedules(7)).toBe(0)
  })
})

describe('createSchedule', () => {
  it('inserts the schedule for the given user', async () => {
    const created = { id: 1, ...SCHEDULE_INPUT }
    queue = [[created]]

    const schedule = await createSchedule(7, SCHEDULE_INPUT)

    expect(schedule).toEqual(created)
    const insert = calls.find(call => call.op === 'insert')
    expect(insert.steps.values).toEqual({ ...SCHEDULE_INPUT, userId: 7 })
  })
})

describe('deleteSchedule', () => {
  it('returns true when a row was deleted', async () => {
    queue = [[{ id: 1 }]]

    expect(await deleteSchedule(1, 7)).toBe(true)
  })

  it('returns false when nothing matched', async () => {
    queue = [[]]

    expect(await deleteSchedule(1, 7)).toBe(false)
  })
})

describe('claimDueSchedules', () => {
  it('locks the due rows, skipping the ones another worker holds', async () => {
    queue = [[{ id: 1 }, { id: 2 }], [], []]

    await claimDueSchedules(5, () => new Date('2026-07-28T07:00:00Z'))

    const select = calls.find(call => call.op === 'select')
    expect(select.steps.limit).toBe(5)
    expect(select.steps.for).toEqual({ strength: 'update', config: { skipLocked: true } })
  })

  it('advances the next run of every claimed row and returns them', async () => {
    const due = [
      { id: 1, frequency: 'daily' },
      { id: 2, frequency: 'hourly' },
    ]
    const nextRuns = {
      1: new Date('2026-07-28T07:00:00Z'),
      2: new Date('2026-07-27T10:00:00Z'),
    }
    queue = [due, [], []]

    const claimed = await claimDueSchedules(5, schedule => nextRuns[schedule.id])

    expect(claimed).toEqual(due)
    const updates = calls.filter(call => call.op === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[0].steps.set.nextRunAt).toEqual(nextRuns[1])
    expect(updates[1].steps.set.nextRunAt).toEqual(nextRuns[2])
    expect(updates[0].steps.set.lastRunAt).toBeInstanceOf(Date)
  })

  it('updates nothing when no schedule is due', async () => {
    queue = [[]]

    expect(await claimDueSchedules(5, () => new Date())).toEqual([])
    expect(calls.filter(call => call.op === 'update')).toHaveLength(0)
  })
})

describe('markScheduleRun', () => {
  it('stores the status and clears the previous error by default', async () => {
    queue = [[]]

    await markScheduleRun(1, { status: 'ok' })

    const update = calls.find(call => call.op === 'update')
    expect(update.steps.set).toMatchObject({ lastStatus: 'ok', lastError: null })
    expect(update.steps.set.updatedAt).toBeInstanceOf(Date)
  })

  it('stores the error message when the run failed', async () => {
    queue = [[]]

    await markScheduleRun(1, { status: 'error', error: 'boom' })

    const update = calls.find(call => call.op === 'update')
    expect(update.steps.set).toMatchObject({ lastStatus: 'error', lastError: 'boom' })
  })
})
