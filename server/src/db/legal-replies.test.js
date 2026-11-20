import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  asc: col => ({ op: 'asc', col }),
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
    orderBy: record('orderBy'),
    values: record('values'),
    returning: record('returning'),
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

const db = { select: () => makeChain('select'), insert: () => makeChain('insert') }
vi.mock('./index.js', () => ({ getDb: () => db }))

const { legalReplies } = await import('./schema.js')
const { listLegalReplies, saveLegalReply } = await import('./legal-replies.js')

beforeEach(() => {
  queue = []
  calls = []
})

describe('saveLegalReply', () => {
  it('stores who sent which text, and returns the reply', async () => {
    const reply = { id: 7, caseId: 41, sentBy: 'ana@example.com', text: 'Hello', sentAt: new Date() }
    queue.push([reply])

    const saved = await saveLegalReply({
      caseId: 41,
      userId: 3,
      sentBy: 'ana@example.com',
      text: 'Hello',
      externalId: '777',
    })

    expect(saved).toBe(reply)
    expect(calls[0].steps.values).toEqual({
      caseId: 41,
      userId: 3,
      sentBy: 'ana@example.com',
      text: 'Hello',
      externalId: '777',
    })
  })
})

describe('listLegalReplies', () => {
  it('lists the replies of the cases, oldest first', async () => {
    queue.push([{ id: 7 }])

    expect(await listLegalReplies([41, 42])).toEqual([{ id: 7 }])
    expect(calls[0].steps.where).toEqual({ op: 'inArray', col: legalReplies.caseId, val: [41, 42] })
    expect(calls[0].steps.orderBy).toEqual({ op: 'asc', col: legalReplies.createdAt })
  })

  it('does not query without cases', async () => {
    expect(await listLegalReplies([])).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
