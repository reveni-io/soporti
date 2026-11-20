import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    limit: () => chain,
    where: condition => {
      call.steps.where = condition
      return chain
    },
    values: v => {
      call.steps.values = v
      return chain
    },
    onConflictDoUpdate: v => {
      call.steps.onConflictDoUpdate = v
      return chain
    },
    onConflictDoNothing: v => {
      call.steps.onConflictDoNothing = v
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
    delete: () => makeChain('delete'),
  }),
}))

const { appConfig } = await import('./schema.js')
const { getConfigValue, setConfigValue, insertConfigValueIfAbsent, deleteConfigValueIfUnchanged } =
  await import('./app-config.js')

const dialect = new PgDialect()

function render(expression) {
  const { sql, params } = dialect.sqlToQuery(expression)

  return { sql, params }
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('getConfigValue', () => {
  it('returns the stored value of the key', async () => {
    queue = [[{ value: { enabled: true } }]]

    expect(await getConfigValue('feature')).toEqual({ enabled: true })
    expect(render(calls[0].steps.where)).toEqual({ sql: '"app_config"."key" = $1', params: ['feature'] })
  })

  it('returns null when the key is not stored', async () => {
    queue = [[]]

    expect(await getConfigValue('feature')).toBeNull()
  })
})

describe('setConfigValue', () => {
  it('inserts the value and overwrites it on conflict', async () => {
    await setConfigValue('feature', 'on')

    expect(calls[0].op).toBe('insert')
    expect(calls[0].steps.values).toEqual({ key: 'feature', value: 'on', updatedAt: expect.any(Date) })
    expect(calls[0].steps.onConflictDoUpdate).toEqual({
      target: appConfig.key,
      set: { value: 'on', updatedAt: expect.any(Date) },
    })
  })
})

describe('insertConfigValueIfAbsent', () => {
  it('inserts the value and keeps the stored one on conflict', async () => {
    await insertConfigValueIfAbsent('feature', 'on')

    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('insert')
    expect(calls[0].steps.values).toEqual({ key: 'feature', value: 'on', updatedAt: expect.any(Date) })
    expect(calls[0].steps.onConflictDoNothing).toEqual({ target: appConfig.key })
    expect(calls[0].steps.onConflictDoUpdate).toBeUndefined()
  })
})

describe('deleteConfigValueIfUnchanged', () => {
  it('deletes the key only while it still holds the given value, compared as JSON', async () => {
    queue = [[{ key: 'feature' }]]

    expect(await deleteConfigValueIfUnchanged('feature', 'v1:old')).toBe(true)
    expect(calls[0].op).toBe('delete')
    expect(render(calls[0].steps.where)).toEqual({
      sql: '("app_config"."key" = $1 and "app_config"."value" = $2)',
      params: ['feature', '"v1:old"'],
    })
  })

  it('reports false when the value changed in between', async () => {
    queue = [[]]

    expect(await deleteConfigValueIfUnchanged('feature', 'v1:old')).toBe(false)
  })
})
