import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
  lte: (col, val) => ({ op: 'lte', col, val }),
  isNull: col => ({ op: 'isNull', col }),
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

const { schedules } = await import('./schema.js')

const {
  listSchedules,
  countSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  claimDueSchedules,
  markScheduleRun,
  setScheduleLegal,
  countLegalSchedules,
} = await import('./schedules.js')

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

const OWN_SCHEDULES_ONLY = { op: 'isNull', col: schedules.botId }

describe('listSchedules', () => {
  it('returns the rows from the DB', async () => {
    const rows = [{ id: 1, question: 'Failed payments' }]
    queue = [rows]

    expect(await listSchedules(7)).toEqual(rows)
  })

  it('lists only the scheduled queries of the user, never the routines of a bot', async () => {
    queue = [[]]

    await listSchedules(7)

    const select = calls.find(call => call.op === 'select')
    expect(select.steps.where.preds).toEqual([{ op: 'eq', col: schedules.userId, val: 7 }, OWN_SCHEDULES_ONLY])
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

  it('does not count the routines of a bot against the limit', async () => {
    queue = [[{ total: 0 }]]

    await countSchedules(7)

    const select = calls.find(call => call.op === 'select')
    expect(select.steps.where.preds).toContainEqual(OWN_SCHEDULES_ONLY)
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

describe('updateSchedule', () => {
  it('updates the schedule and stamps updatedAt', async () => {
    const updated = { id: 1, ...SCHEDULE_INPUT }
    queue = [[updated]]

    const schedule = await updateSchedule(1, 7, SCHEDULE_INPUT)

    expect(schedule).toEqual(updated)
    const update = calls.find(call => call.op === 'update')
    expect(update.steps.set).toMatchObject(SCHEDULE_INPUT)
    expect(update.steps.set.updatedAt).toBeInstanceOf(Date)
  })

  it('returns null when the schedule does not exist or is not owned', async () => {
    queue = [[]]

    expect(await updateSchedule(1, 7, SCHEDULE_INPUT)).toBeNull()
  })

  it('never touches the routine of a bot', async () => {
    queue = [[]]

    await updateSchedule(1, 7, SCHEDULE_INPUT)

    const update = calls.find(call => call.op === 'update')
    expect(update.steps.where.preds).toEqual([
      { op: 'eq', col: schedules.id, val: 1 },
      { op: 'eq', col: schedules.userId, val: 7 },
      OWN_SCHEDULES_ONLY,
    ])
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

  it('never deletes the routine of a bot', async () => {
    queue = [[]]

    await deleteSchedule(1, 7)

    const remove = calls.find(call => call.op === 'delete')
    expect(remove.steps.where.preds).toContainEqual(OWN_SCHEDULES_ONLY)
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

  it('leaves paused routines out of the claim', async () => {
    queue = [[]]

    await claimDueSchedules(5, () => new Date())

    const select = calls.find(call => call.op === 'select')
    expect(select.steps.where.preds).toContainEqual({ op: 'eq', col: schedules.paused, val: false })
    expect(select.steps.where.preds[0]).toMatchObject({ op: 'lte', col: schedules.nextRunAt })
  })

  it('deletes a one-off routine instead of rescheduling it, and still returns it to run', async () => {
    const due = [
      { id: 1, frequency: 'once', botId: 4, title: 'Remind me', lastRunAt: null },
      { id: 2, frequency: 'weekdays', botId: 4, title: 'Daily triage', lastRunAt: new Date('2026-07-27T15:00:00Z') },
    ]
    const nextRunFor = vi.fn(() => new Date('2026-07-28T15:00:00Z'))
    queue = [due, [], []]

    const claimed = await claimDueSchedules(5, nextRunFor)

    expect(claimed).toEqual(due)
    const removals = calls.filter(call => call.op === 'delete')
    expect(removals).toHaveLength(1)
    expect(removals[0].steps.where).toEqual({ op: 'eq', col: schedules.id, val: 1 })
    const updates = calls.filter(call => call.op === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].steps.where).toEqual({ op: 'eq', col: schedules.id, val: 2 })
    expect(nextRunFor).toHaveBeenCalledTimes(1)
    expect(nextRunFor).toHaveBeenCalledWith(due[1])
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

describe('setScheduleLegal', () => {
  it('changes only the Legal review of an owned query', async () => {
    queue = [[{ id: 1, legal: true }]]

    expect(await setScheduleLegal(1, 7, true)).toEqual({ id: 1, legal: true })
    const update = calls.find(call => call.op === 'update')
    expect(update.steps.set).toEqual({ legal: true, updatedAt: expect.any(Date) })
    expect(update.steps.where.preds).toEqual([
      { op: 'eq', col: schedules.id, val: 1 },
      { op: 'eq', col: schedules.userId, val: 7 },
      OWN_SCHEDULES_ONLY,
    ])
  })

  it('returns null when the query is not owned', async () => {
    queue = [[]]

    expect(await setScheduleLegal(1, 7, false)).toBeNull()
  })
})

describe('countLegalSchedules', () => {
  it('counts the queries of every user with the Legal review on', async () => {
    queue = [[{ total: 4 }]]

    expect(await countLegalSchedules()).toBe(4)
    const select = calls.find(call => call.op === 'select')
    expect(select.steps.where.preds).toEqual([{ op: 'eq', col: schedules.legal, val: true }, OWN_SCHEDULES_ONLY])
  })

  it('returns 0 without rows', async () => {
    queue = [[]]

    expect(await countLegalSchedules()).toBe(0)
  })
})
