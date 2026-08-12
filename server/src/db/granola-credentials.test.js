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

const { getGranolaCredential, setGranolaCredential, deleteGranolaCredential } = await import('./granola-credentials.js')

const API_KEY = 'grn_dGVzdGtleTEyMzQ1Njc4OTA'

beforeEach(() => {
  queue = []
  calls = []
})

describe('getGranolaCredential', () => {
  it('returns the stored key', async () => {
    queue = [[{ apiKey: API_KEY }]]
    expect(await getGranolaCredential(7)).toBe(API_KEY)
  })

  it('returns null when the user has no row', async () => {
    queue = [[]]
    expect(await getGranolaCredential(7)).toBeNull()
  })
})

describe('setGranolaCredential', () => {
  it('upserts the key for that user', async () => {
    await setGranolaCredential(7, API_KEY)

    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toMatchObject({ userId: 7, apiKey: API_KEY })
    expect(insert.steps.onConflictDoUpdate.set).toMatchObject({ apiKey: API_KEY })
  })
})

describe('deleteGranolaCredential', () => {
  it('deletes the row', async () => {
    await deleteGranolaCredential(7)
    expect(calls.find(c => c.op === 'delete')).toBeDefined()
  })
})
