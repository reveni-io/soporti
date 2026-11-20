import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
  gte: (col, val) => ({ op: 'gte', col, val }),
  inArray: (col, val) => ({ op: 'inArray', col, val }),
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
    values: record('values'),
    returning: record('returning'),
    innerJoin: record('innerJoin'),
    groupBy: record('groupBy'),
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

const db = { select: () => makeChain('select'), insert: () => makeChain('insert') }
vi.mock('./index.js', () => ({ getDb: () => db }))

const { legalCases, legalReplies } = await import('./schema.js')
const { countCasesByGuardSince, countSentRepliesByGuardSince, findOwnedLegalCases, getOwnedLegalCase, saveLegalCase } =
  await import('./legal-cases.js')

const SINCE = new Date('2026-10-21T00:00:00.000Z')

beforeEach(() => {
  queue = []
  calls = []
})

describe('saveLegalCase', () => {
  it('stores the case and returns its id', async () => {
    queue.push([{ id: 41 }])
    const legalCase = { userId: 3, guardId: 'legal', source: 'zendesk', ticketId: '48213' }

    expect(await saveLegalCase(legalCase)).toBe(41)
    expect(calls[0].steps.values).toEqual(legalCase)
  })

  it('returns null when nothing came back', async () => {
    expect(await saveLegalCase({ userId: 3 })).toBeNull()
  })
})

describe('findOwnedLegalCases', () => {
  it('keeps only the cases of the user', async () => {
    queue.push([{ id: 41, guardId: 'legal' }])

    expect(await findOwnedLegalCases([41, 42], 3)).toEqual([{ id: 41, guardId: 'legal' }])
    expect(calls[0].steps.where).toEqual({
      op: 'and',
      preds: [
        { op: 'inArray', col: legalCases.id, val: [41, 42] },
        { op: 'eq', col: legalCases.userId, val: 3 },
      ],
    })
  })

  it('does not query without ids', async () => {
    expect(await findOwnedLegalCases([], 3)).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe('getOwnedLegalCase', () => {
  it('returns the case of the user or null', async () => {
    queue.push([{ id: 41 }], [])

    expect(await getOwnedLegalCase(41, 3)).toEqual({ id: 41 })
    expect(await getOwnedLegalCase(42, 3)).toBeNull()
  })
})

describe('countCasesByGuardSince', () => {
  it('counts the cases of each guard since a date', async () => {
    queue.push([{ guardId: 'legal', cases: 4 }])

    expect(await countCasesByGuardSince(SINCE)).toEqual([{ guardId: 'legal', cases: 4 }])
    expect(calls[0].steps.where).toEqual({ op: 'gte', col: legalCases.createdAt, val: SINCE })
    expect(calls[0].steps.groupBy).toBe(legalCases.guardId)
  })
})

describe('countSentRepliesByGuardSince', () => {
  it('counts the replies sent from the cases of each guard since a date', async () => {
    queue.push([{ guardId: 'legal', replies: 2 }])

    expect(await countSentRepliesByGuardSince(SINCE)).toEqual([{ guardId: 'legal', replies: 2 }])
    expect(calls[0].steps.from).toBe(legalReplies)
    expect(calls[0].steps.where).toEqual({ op: 'gte', col: legalReplies.createdAt, val: SINCE })
  })
})
