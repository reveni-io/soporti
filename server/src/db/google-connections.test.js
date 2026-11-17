import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    values: v => {
      call.steps.values = v
      return chain
    },
    onConflictDoUpdate: v => {
      call.steps.onConflictDoUpdate = v
      return chain
    },
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
    delete: () => makeChain('delete'),
  }),
}))

const { getGoogleConnection, upsertGoogleConnection, deleteGoogleConnection } = await import('./google-connections.js')

const ROW = { email: 'jane@example.com', refreshToken: 'v1:iv:tag:cipher', scopes: 'openid email' }

beforeEach(() => {
  queue = []
  calls = []
})

describe('getGoogleConnection', () => {
  it('returns the stored connection', async () => {
    queue = [[ROW]]

    expect(await getGoogleConnection(7)).toEqual(ROW)
  })

  it('returns null when the user has no row', async () => {
    queue = [[]]

    expect(await getGoogleConnection(7)).toBeNull()
  })
})

describe('upsertGoogleConnection', () => {
  it('inserts the connection and overwrites every field on conflict', async () => {
    await upsertGoogleConnection(7, ROW)

    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toMatchObject({ userId: 7, ...ROW })
    expect(insert.steps.values.updatedAt).toBeInstanceOf(Date)
    expect(insert.steps.onConflictDoUpdate.set).toMatchObject(ROW)
  })
})

describe('deleteGoogleConnection', () => {
  it('deletes the row', async () => {
    await deleteGoogleConnection(7)

    expect(calls.filter(c => c.op === 'delete')).toHaveLength(1)
  })
})
