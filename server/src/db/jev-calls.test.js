import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
  gte: (col, val) => ({ op: 'gte', col, val }),
}))

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const record = name => value => {
    call.steps[name] = value
    return chain
  }
  const chain = {
    from: record('from'),
    where: record('where'),
    groupBy: record('groupBy'),
    values: record('values'),
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

const db = { select: () => makeChain('select'), insert: () => makeChain('insert') }
vi.mock('./index.js', () => ({ getDb: () => db }))

const { jevCalls } = await import('./schema.js')
const { countJevCallsByProjectSince, countJevCallsBySetVersion, countJevCallsSince, recordJevCall } =
  await import('./jev-calls.js')

const SINCE = new Date('2026-11-19T00:00:00.000Z')

beforeEach(() => {
  queue = []
  calls = []
})

describe('recordJevCall', () => {
  it('stores a call without an answered model or reason by default', async () => {
    await recordJevCall({ project: 'legal', setVersion: 7, model: 'jev-latest', status: 'answered' })

    expect(calls[0].steps.values).toEqual({
      project: 'legal',
      setVersion: 7,
      model: 'jev-latest',
      answeredModel: null,
      status: 'answered',
      reason: null,
    })
  })
})

describe('countJevCallsSince', () => {
  it('counts the calls of a project since a date', async () => {
    queue.push([{ total: 12 }])

    expect(await countJevCallsSince('legal', SINCE)).toBe(12)
    expect(calls[0].steps.where).toEqual({
      op: 'and',
      preds: [
        { op: 'eq', col: jevCalls.project, val: 'legal' },
        { op: 'gte', col: jevCalls.createdAt, val: SINCE },
      ],
    })
  })

  it('returns 0 without rows', async () => {
    expect(await countJevCallsSince('legal', SINCE)).toBe(0)
  })
})

describe('countJevCallsByProjectSince', () => {
  it('groups the calls by project', async () => {
    queue.push([{ project: 'github', calls: 3 }])

    expect(await countJevCallsByProjectSince(SINCE)).toEqual([{ project: 'github', calls: 3 }])
    expect(calls[0].steps.groupBy).toBe(jevCalls.project)
  })
})

describe('countJevCallsBySetVersion', () => {
  it('groups the calls of a project by set version', async () => {
    queue.push([{ setVersion: 7, calls: 17 }])

    expect(await countJevCallsBySetVersion('legal')).toEqual([{ setVersion: 7, calls: 17 }])
    expect(calls[0].steps.where).toEqual({ op: 'eq', col: jevCalls.project, val: 'legal' })
    expect(calls[0].steps.groupBy).toBe(jevCalls.setVersion)
  })
})
