import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
  inArray: (col, val) => ({ op: 'inArray', col, val }),
  isNotNull: col => ({ op: 'isNotNull', col }),
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
    innerJoin: () => chain,
    groupBy: record('groupBy'),
    having: record('having'),
    orderBy: () => chain,
    limit: record('limit'),
    offset: record('offset'),
    as: alias => {
      call.steps.as = alias
      return { checked: 'runs.checked', at: 'runs.at' }
    },
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

const db = { select: () => makeChain('select'), insert: () => makeChain('insert'), delete: () => makeChain('delete') }
vi.mock('./index.js', () => ({ getDb: () => db }))

const { legalCases } = await import('./schema.js')
const { countLegalRuns, deleteLegalCases, findDraftedLegalCases, isDrafted, listUncheckedLegalRuns, saveLegalCase } =
  await import('./legal-cases.js')

const TICKET = { source: 'zendesk', ticketId: '48213', messageHash: 'abc' }

beforeEach(() => {
  queue = []
  calls = []
})

describe('findDraftedLegalCases', () => {
  it('finds the tickets of the query already drafted for the same customer message, failed drafts aside', async () => {
    queue.push([TICKET])

    const drafted = await findDraftedLegalCases(3, [TICKET, { ...TICKET, ticketId: '2', messageHash: 'def' }])

    expect(isDrafted(drafted, TICKET)).toBe(true)
    expect(isDrafted(drafted, { ...TICKET, messageHash: 'new message' })).toBe(false)
    expect(calls[0].steps.where).toEqual({
      op: 'and',
      preds: [
        { op: 'eq', col: legalCases.scheduleId, val: 3 },
        { op: 'isNotNull', col: legalCases.draft },
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

describe('deleteLegalCases', () => {
  it('deletes the cases of one run conversation', async () => {
    await deleteLegalCases('conv-1')

    expect(calls[0].op).toBe('delete')
    expect(calls[0].steps.where).toEqual({ op: 'eq', col: legalCases.conversationId, val: 'conv-1' })
  })
})

describe('countLegalRuns', () => {
  it('counts the runs checked in full and the runs with an unchecked case', async () => {
    queue.push([{ checked: 27, notChecked: 6 }])

    expect(await countLegalRuns()).toEqual({ checked: 27, notChecked: 6 })
    expect(calls[0].steps.groupBy).toBe(legalCases.conversationId)
    expect(calls[0].steps.as).toBe('runs')
  })

  it('reports no runs without cases', async () => {
    expect(await countLegalRuns()).toEqual({ checked: 0, notChecked: 0 })
  })
})

describe('listUncheckedLegalRuns', () => {
  it('returns one page of the runs Jev could not check, with the total', async () => {
    const entries = [
      {
        at: '2026-11-19T07:00:00Z',
        query: 'Draft replies',
        owner: 'ana@example.com',
        setVersion: 7,
        reasons: 'Jev error (HTTP 502)',
      },
    ]
    queue.push(entries, [{ total: 6 }])

    expect(await listUncheckedLegalRuns(2)).toEqual({ entries, total: 6, page: 2, pageSize: 5 })
    const page = calls.find(call => call.steps.limit)
    expect(page.steps.limit).toBe(5)
    expect(page.steps.offset).toBe(5)
    expect(calls[0].steps.as).toBe('unchecked_runs')
  })
})
