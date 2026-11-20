import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
  isNotNull: col => ({ op: 'isNotNull', col }),
}))

let queue = []
let calls = []

function makeChain(op, table) {
  const call = { op, table, steps: {} }
  calls.push(call)
  const record = name => value => {
    call.steps[name] = value
    return chain
  }
  const chain = {
    from: record('from'),
    where: record('where'),
    orderBy: () => chain,
    limit: record('limit'),
    offset: record('offset'),
    for: record('for'),
    set: record('set'),
    values: record('values'),
    onConflictDoNothing: record('onConflictDoNothing'),
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
  insert: table => makeChain('insert', table),
  update: table => makeChain('update', table),
  transaction: callback => callback(db),
}

vi.mock('./index.js', () => ({ getDb: () => db }))

const { jevDocuments, jevHistory, jevSetVersions } = await import('./schema.js')
const { getJevDocument, getLatestJevSave, listJevSetVersions, saveJevDocument } = await import('./jev-documents.js')

const DEFAULTS = { set: { questions: [] } }
const CURRENT = { id: 'legal', rev: 3, data: { set: { questions: ['old'] } }, setVersion: 2 }

beforeEach(() => {
  queue = []
  calls = []
})

describe('getJevDocument', () => {
  it('returns the stored document or null', async () => {
    queue.push([CURRENT], [])

    expect(await getJevDocument('legal')).toEqual(CURRENT)
    expect(await getJevDocument('github')).toBeNull()
    expect(calls[0].steps.where).toEqual({ op: 'eq', col: jevDocuments.id, val: 'legal' })
  })
})

describe('getLatestJevSave', () => {
  it('reads the latest versioned entry of the document', async () => {
    const entry = { at: new Date(), author: 'ana@example.com', change: 'Questions', rev: 3 }
    queue.push([entry])

    expect(await getLatestJevSave('legal')).toEqual(entry)
    expect(calls[0].steps.where).toEqual({
      op: 'and',
      preds: [
        { op: 'eq', col: jevHistory.documentId, val: 'legal' },
        { op: 'isNotNull', col: jevHistory.rev },
      ],
    })
  })

  it('returns null before the first save', async () => {
    queue.push([])

    expect(await getLatestJevSave('legal')).toBeNull()
  })
})

describe('saveJevDocument', () => {
  function save(plan, expectedRev = 3) {
    return saveJevDocument('legal', { expectedRev, author: 'ana@example.com', defaults: DEFAULTS, plan })
  }

  it('creates the row with the defaults and locks it before comparing versions', async () => {
    queue.push([], [CURRENT])

    await save(() => null)

    expect(calls[0]).toMatchObject({ op: 'insert', table: jevDocuments })
    expect(calls[0].steps.values).toEqual({ id: 'legal', rev: 0, data: DEFAULTS, setVersion: 0 })
    expect(calls[1].steps.for).toBe('update')
  })

  it('reports a conflict when someone saved a newer version', async () => {
    queue.push([], [CURRENT])
    const plan = vi.fn()

    expect(await save(plan, 2)).toEqual({ conflict: true, document: CURRENT })
    expect(plan).not.toHaveBeenCalled()
    expect(calls).toHaveLength(2)
  })

  it('leaves the document untouched when the plan finds no change', async () => {
    queue.push([], [CURRENT])
    const plan = vi.fn().mockReturnValue(null)

    expect(await save(plan)).toEqual({ conflict: false, document: CURRENT })
    expect(plan).toHaveBeenCalledWith(CURRENT)
    expect(calls).toHaveLength(2)
  })

  it('stores a new set version, the history entry and the next revision', async () => {
    const saved = { ...CURRENT, rev: 4, setVersion: 3 }
    queue.push([], [CURRENT], [], [], [saved])
    const data = { set: { questions: ['new'] } }

    const result = await save(() => ({ data, change: 'Questions', set: { questions: ['new'] } }))

    expect(result).toEqual({ conflict: false, document: saved })
    expect(calls[2]).toMatchObject({ op: 'insert', table: jevSetVersions })
    expect(calls[2].steps.values).toEqual({
      documentId: 'legal',
      version: 3,
      set: { questions: ['new'] },
      authorEmail: 'ana@example.com',
      change: 'Questions',
    })
    expect(calls[3]).toMatchObject({ op: 'insert', table: jevHistory })
    expect(calls[3].steps.values).toEqual({
      documentId: 'legal',
      rev: 4,
      authorEmail: 'ana@example.com',
      change: 'Questions (set v3)',
    })
    expect(calls[4].steps.set).toEqual({ rev: 4, data, setVersion: 3, updatedAt: expect.any(Date) })
  })

  it('keeps the set version when the set did not change', async () => {
    queue.push([], [CURRENT], [], [{ ...CURRENT, rev: 4 }])

    await save(() => ({ data: CURRENT.data, change: 'Timeout 30 → 60', set: null }))

    expect(calls.filter(call => call.table === jevSetVersions)).toHaveLength(0)
    expect(calls[2].steps.values.change).toBe('Timeout 30 → 60')
    expect(calls[3].steps.set.setVersion).toBe(2)
  })
})

describe('saveJevDocument validation', () => {
  it('returns the plan error without writing', async () => {
    queue.push([], [CURRENT])

    const result = await saveJevDocument('legal', {
      expectedRev: 3,
      author: 'ana@example.com',
      defaults: DEFAULTS,
      plan: () => ({ error: 'Shadow first.' }),
    })

    expect(result).toEqual({ conflict: false, error: 'Shadow first.', document: CURRENT })
    expect(calls).toHaveLength(2)
  })
})

describe('listJevSetVersions', () => {
  it('returns one page of versions, newest first, with the total', async () => {
    const entries = [{ version: 3, at: new Date(), author: 'ana@example.com', change: 'Questions', set: {} }]
    queue.push(entries, [{ total: 3 }])

    expect(await listJevSetVersions('github', 1)).toEqual({ entries, total: 3, page: 1, pageSize: 5 })
    expect(calls[0].steps.where).toEqual({ op: 'eq', col: jevSetVersions.documentId, val: 'github' })
    expect(calls[0].steps.offset).toBe(0)
  })
})
