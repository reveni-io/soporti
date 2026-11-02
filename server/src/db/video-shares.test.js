import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []

function tableName(ref) {
  return ref?.[Symbol.for('drizzle:Name')] ?? null
}

function makeChain(op, target) {
  const call = { op, target: tableName(target), steps: {} }
  calls.push(call)
  const record = name => value => {
    call.steps[name] = value
    return chain
  }
  const chain = {
    from: table => {
      call.target = tableName(table)
      return chain
    },
    where: record('where'),
    set: record('set'),
    values: record('values'),
    for: record('for'),
    orderBy: () => chain,
    limit: () => chain,
    innerJoin: () => chain,
    returning: () => chain,
    onConflictDoUpdate: record('onConflict'),
    then: (resolve, reject) => {
      const next = queue.shift()
      const promise = next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? [])
      return promise.then(resolve, reject)
    },
  }
  return chain
}

const handle = {
  select: () => makeChain('select'),
  insert: table => makeChain('insert', table),
  update: table => makeChain('update', table),
  delete: table => makeChain('delete', table),
  transaction: fn => fn(handle),
}

vi.mock('./index.js', () => ({ getDb: () => handle }))

const db = await import('./video-shares.js')

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

beforeEach(() => {
  queue = []
  calls = []
})

describe('createOrRefreshVideoShare', () => {
  it('creates or refreshes the share of a rendered version for 30 days', async () => {
    queue = [[{ id: 41 }], [{ id: 'a'.repeat(32) }]]
    const before = Date.now()

    const shareId = await db.createOrRefreshVideoShare({ videoId: VIDEO_ID, userId: 7, version: 2 })

    expect(shareId).toBe('a'.repeat(32))
    const insert = calls.find(call => call.op === 'insert')
    expect(insert.target).toBe('video_shares')
    expect(insert.steps.values).toMatchObject({ videoId: VIDEO_ID, version: 2 })
    expect(insert.steps.values.id).toMatch(/^[a-f0-9]{32}$/)
    expect(insert.steps.values.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000)
    expect(insert.steps.onConflict.set).toEqual({ expiresAt: insert.steps.values.expiresAt })
  })

  it('returns null for a version with no MP4 or not owned', async () => {
    queue = [[]]

    expect(await db.createOrRefreshVideoShare({ videoId: VIDEO_ID, userId: 7, version: 2 })).toBeNull()
    expect(calls.filter(call => call.op === 'insert')).toHaveLength(0)
  })
})

describe('getSharedVideo', () => {
  it('returns the MP4 of an unexpired share, or null', async () => {
    const mp4 = Buffer.from('mp4')
    queue = [[{ title: 'Refunds', version: 2, mp4 }], []]

    expect(await db.getSharedVideo('a'.repeat(32))).toEqual({ title: 'Refunds', version: 2, mp4 })
    expect(await db.getSharedVideo('b'.repeat(32))).toBeNull()
  })
})
