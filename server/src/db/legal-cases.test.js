import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
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
    onConflictDoNothing: record('onConflictDoNothing'),
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

const db = { select: () => makeChain('select'), insert: () => makeChain('insert') }
vi.mock('./index.js', () => ({ getDb: () => db }))

const { legalCases } = await import('./schema.js')
const { findDraftedLegalCases, isDrafted, saveLegalCase } = await import('./legal-cases.js')

const TICKET = { source: 'zendesk', ticketId: '48213', messageHash: 'abc' }

beforeEach(() => {
  queue = []
  calls = []
})

describe('findDraftedLegalCases', () => {
  it('finds the tickets of the query already drafted for the same customer message', async () => {
    queue.push([TICKET])

    const drafted = await findDraftedLegalCases(3, [TICKET, { ...TICKET, ticketId: '2', messageHash: 'def' }])

    expect(isDrafted(drafted, TICKET)).toBe(true)
    expect(isDrafted(drafted, { ...TICKET, messageHash: 'new message' })).toBe(false)
    expect(calls[0].steps.where).toEqual({
      op: 'and',
      preds: [
        { op: 'eq', col: legalCases.scheduleId, val: 3 },
        { op: 'inArray', col: legalCases.messageHash, val: ['abc', 'def'] },
      ],
    })
  })

  it('does not query without tickets', async () => {
    expect((await findDraftedLegalCases(3, [])).size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})

describe('saveLegalCase', () => {
  it('stores the case once', async () => {
    await saveLegalCase({ ...TICKET, scheduleId: 3 })

    expect(calls[0].steps.values).toEqual({ ...TICKET, scheduleId: 3 })
    expect(calls[0].steps).toHaveProperty('onConflictDoNothing')
  })
})
