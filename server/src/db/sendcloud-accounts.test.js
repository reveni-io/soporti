import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    values: v => {
      call.steps.values = v
      return chain
    },
    returning: columns => {
      call.steps.returning = columns
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

const { listSendcloudAccounts, createSendcloudAccount, deleteSendcloudAccount } =
  await import('./sendcloud-accounts.js')

const ACCOUNT = {
  id: 1,
  name: 'Acme EU',
  publicKey: 'public-key-123',
  secretKey: 'secret-key-456',
  createdAt: new Date('2026-10-01T10:00:00Z'),
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('listSendcloudAccounts', () => {
  it('returns every stored account with its keys', async () => {
    queue = [[ACCOUNT]]

    expect(await listSendcloudAccounts()).toEqual([ACCOUNT])
    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('select')
  })
})

describe('createSendcloudAccount', () => {
  it('inserts the account and returns it without its keys', async () => {
    queue = [[{ id: 1, name: 'Acme EU', createdAt: ACCOUNT.createdAt }]]

    const row = await createSendcloudAccount({ name: 'Acme EU', publicKey: 'public-key-123', secretKey: 'secret' })

    expect(row).toEqual({ id: 1, name: 'Acme EU', createdAt: ACCOUNT.createdAt })
    expect(calls[0].steps.values).toEqual({ name: 'Acme EU', publicKey: 'public-key-123', secretKey: 'secret' })
    expect(Object.keys(calls[0].steps.returning)).toEqual(['id', 'name', 'createdAt'])
  })

  it('lets a duplicate name error reach the caller', async () => {
    queue = [Object.assign(new Error('duplicate'), { code: '23505' })]

    await expect(createSendcloudAccount({ name: 'Acme EU', publicKey: 'a', secretKey: 'b' })).rejects.toMatchObject({
      code: '23505',
    })
  })
})

describe('deleteSendcloudAccount', () => {
  it('reports true when a row was removed', async () => {
    queue = [[{ id: 1 }]]

    expect(await deleteSendcloudAccount(1)).toBe(true)
    expect(calls[0].op).toBe('delete')
  })

  it('reports false when there was nothing to remove', async () => {
    queue = [[]]

    expect(await deleteSendcloudAccount(99)).toBe(false)
  })
})
