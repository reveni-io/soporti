import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    innerJoin: () => {
      call.steps.joined = true
      return chain
    },
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    set: v => {
      call.steps.set = v
      return chain
    },
    values: v => {
      call.steps.values = v
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

vi.mock('./index.js', () => ({
  getDb: () => ({
    select: () => makeChain('select'),
    insert: () => makeChain('insert'),
    update: () => makeChain('update'),
    delete: () => makeChain('delete'),
  }),
}))

const { listApiKeys, countApiKeys, createApiKey, revokeApiKey, findActiveApiKeyByHash, touchApiKeyLastUsed } =
  await import('./api-keys.js')

beforeEach(() => {
  queue = []
  calls = []
})

describe('listApiKeys', () => {
  it('returns the rows from the DB', async () => {
    const rows = [{ id: 1, name: 'mcp', prefix: 'sop_abcd1234' }]
    queue = [rows]
    expect(await listApiKeys(7)).toEqual(rows)
  })
})

describe('countApiKeys', () => {
  it('returns the counted value', async () => {
    queue = [[{ value: 3 }]]
    expect(await countApiKeys(7)).toBe(3)
  })

  it('returns 0 when the count comes back empty', async () => {
    queue = [[]]
    expect(await countApiKeys(7)).toBe(0)
  })
})

describe('createApiKey', () => {
  it('inserts the hash and never the plaintext key', async () => {
    const created = { id: 1, name: 'mcp', prefix: 'sop_abcd1234', sources: [] }
    queue = [[created]]

    const apiKey = await createApiKey(7, { name: 'mcp', prefix: 'sop_abcd1234', keyHash: 'hash', sources: [] })

    expect(apiKey).toEqual(created)
    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toEqual({
      userId: 7,
      name: 'mcp',
      prefix: 'sop_abcd1234',
      keyHash: 'hash',
      sources: [],
    })
  })
})

describe('revokeApiKey', () => {
  it('stamps revokedAt and reports success', async () => {
    queue = [[{ id: 1 }]]

    expect(await revokeApiKey(1, 7)).toBe(true)
    const update = calls.find(c => c.op === 'update')
    expect(update.steps.set.revokedAt).toBeInstanceOf(Date)
  })

  it('returns false when nothing matched (not found, not owned or already revoked)', async () => {
    queue = [[]]
    expect(await revokeApiKey(1, 7)).toBe(false)
  })
})

describe('findActiveApiKeyByHash', () => {
  it('returns the key joined with its owner', async () => {
    const row = { id: 1, sources: ['yolo'], userId: 7, email: 'jane@example.com', name: 'Jane', role: 'user' }
    queue = [[row]]

    expect(await findActiveApiKeyByHash('hash')).toEqual(row)
    expect(calls.find(c => c.op === 'select').steps.joined).toBe(true)
  })

  it('returns null when no active key matches the hash', async () => {
    queue = [[]]
    expect(await findActiveApiKeyByHash('hash')).toBeNull()
  })
})

describe('touchApiKeyLastUsed', () => {
  it('sets lastUsedAt to the current time', async () => {
    queue = [[]]

    await touchApiKeyLastUsed(1)

    const update = calls.find(c => c.op === 'update')
    expect(update.steps.set.lastUsedAt).toBeInstanceOf(Date)
  })
})
