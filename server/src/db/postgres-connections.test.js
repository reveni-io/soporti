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
    set: v => {
      call.steps.set = v
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
    update: () => makeChain('update'),
    delete: () => makeChain('delete'),
  }),
}))

const { listPostgresConnections, createPostgresConnection, updatePostgresConnection, deletePostgresConnection } =
  await import('./postgres-connections.js')

const CONNECTION = {
  id: 1,
  name: 'production',
  connectionString: 'postgresql://user:pass@host:5432/prod',
  createdAt: new Date('2026-10-01T10:00:00Z'),
  updatedAt: new Date('2026-10-01T10:00:00Z'),
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('listPostgresConnections', () => {
  it('returns every stored connection with its connection string', async () => {
    queue = [[CONNECTION]]

    expect(await listPostgresConnections()).toEqual([CONNECTION])
    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('select')
  })
})

describe('createPostgresConnection', () => {
  it('inserts the connection and returns it without its connection string', async () => {
    queue = [[{ id: 1, name: 'production', createdAt: CONNECTION.createdAt }]]

    const row = await createPostgresConnection({ name: 'production', connectionString: 'postgresql://host/prod' })

    expect(row).toEqual({ id: 1, name: 'production', createdAt: CONNECTION.createdAt })
    expect(calls[0].steps.values).toEqual({ name: 'production', connectionString: 'postgresql://host/prod' })
    expect(Object.keys(calls[0].steps.returning)).toEqual(['id', 'name', 'createdAt'])
  })

  it('lets a duplicate name error reach the caller', async () => {
    queue = [Object.assign(new Error('duplicate'), { code: '23505' })]

    await expect(createPostgresConnection({ name: 'production', connectionString: 'x' })).rejects.toMatchObject({
      code: '23505',
    })
  })
})

describe('updatePostgresConnection', () => {
  it('sets the changes with a fresh update time and returns the summary', async () => {
    queue = [[{ id: 1, name: 'billing', createdAt: CONNECTION.createdAt }]]

    const row = await updatePostgresConnection(1, { name: 'billing' })

    expect(row).toEqual({ id: 1, name: 'billing', createdAt: CONNECTION.createdAt })
    expect(calls[0].op).toBe('update')
    expect(calls[0].steps.set).toEqual({ name: 'billing', updatedAt: expect.any(Date) })
    expect(Object.keys(calls[0].steps.returning)).toEqual(['id', 'name', 'createdAt'])
  })

  it('returns null when there is no such connection', async () => {
    queue = [[]]

    expect(await updatePostgresConnection(99, { name: 'billing' })).toBeNull()
  })
})

describe('deletePostgresConnection', () => {
  it('reports true when a row was removed', async () => {
    queue = [[{ id: 1 }]]

    expect(await deletePostgresConnection(1)).toBe(true)
    expect(calls[0].op).toBe('delete')
  })

  it('reports false when there was nothing to remove', async () => {
    queue = [[]]

    expect(await deletePostgresConnection(99)).toBe(false)
  })
})
