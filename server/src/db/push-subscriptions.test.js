import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

let queue = []
let calls = []

function tableName(ref) {
  return ref?.[Symbol.for('drizzle:Name')] ?? null
}

function makeChain(op, target) {
  const call = { op, target: tableName(target), steps: {} }
  calls.push(call)
  const chain = {
    from: table => {
      call.target = tableName(table)
      return chain
    },
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
    orderBy: v => {
      call.steps.orderBy = v
      return chain
    },
    offset: v => {
      call.steps.offset = v
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
    select: columns => {
      const chain = makeChain('select')
      calls.at(-1).steps.columns = columns
      return chain
    },
    insert: table => makeChain('insert', table),
    delete: table => makeChain('delete', table),
  }),
}))

const { pushSubscriptions } = await import('./schema.js')
const {
  upsertPushSubscription,
  listPushSubscriptions,
  deleteUserPushSubscription,
  deletePushSubscription,
  deleteAllPushSubscriptions,
} = await import('./push-subscriptions.js')

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'
const SUBSCRIPTION = { endpoint: ENDPOINT, p256dh: 'BPublicKey', auth: 'AuthSecret' }

const dialect = new PgDialect()

function render(expression) {
  const { sql, params } = dialect.sqlToQuery(expression)

  return { sql, params }
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('upsertPushSubscription', () => {
  it('inserts the subscription and reassigns it to the user when the endpoint already exists', async () => {
    await upsertPushSubscription(7, { ...SUBSCRIPTION, userAgent: 'Firefox' })

    expect(calls).toHaveLength(2)
    const [insert] = calls
    expect(insert.op).toBe('insert')
    expect(insert.target).toBe('push_subscriptions')
    expect(insert.steps.values).toEqual({
      userId: 7,
      ...SUBSCRIPTION,
      userAgent: 'Firefox',
      updatedAt: expect.any(Date),
    })
    expect(insert.steps.onConflictDoUpdate.target).toBe(pushSubscriptions.endpoint)
    expect(insert.steps.onConflictDoUpdate.set).toEqual({
      userId: 7,
      p256dh: 'BPublicKey',
      auth: 'AuthSecret',
      userAgent: 'Firefox',
      updatedAt: insert.steps.values.updatedAt,
    })
  })

  it('keeps only the 20 most recently saved subscriptions of the user', async () => {
    queue = [[], [{ id: 31 }, { id: 32 }]]

    await upsertPushSubscription(7, { ...SUBSCRIPTION, userAgent: null })

    expect(calls).toHaveLength(3)
    const [, stale, prune] = calls
    expect(stale.op).toBe('select')
    expect(render(stale.steps.where)).toEqual({ sql: '"push_subscriptions"."user_id" = $1', params: [7] })
    expect(render(stale.steps.orderBy)).toEqual({ sql: '"push_subscriptions"."updated_at" desc', params: [] })
    expect(stale.steps.offset).toBe(20)
    expect(prune.op).toBe('delete')
    expect(render(prune.steps.where)).toEqual({ sql: '"push_subscriptions"."id" in ($1, $2)', params: [31, 32] })
  })

  it('deletes nothing when the user is within the limit', async () => {
    queue = [[], []]

    await upsertPushSubscription(7, { ...SUBSCRIPTION, userAgent: null })

    expect(calls.map(call => call.op)).toEqual(['insert', 'select'])
  })
})

describe('listPushSubscriptions', () => {
  it('lists the endpoint and keys of every subscription of the user', async () => {
    queue = [[SUBSCRIPTION]]

    expect(await listPushSubscriptions(7)).toEqual([SUBSCRIPTION])
    expect(calls[0].target).toBe('push_subscriptions')
    expect(Object.keys(calls[0].steps.columns)).toEqual(['endpoint', 'p256dh', 'auth'])
    expect(render(calls[0].steps.where)).toEqual({ sql: '"push_subscriptions"."user_id" = $1', params: [7] })
  })
})

describe('deleteUserPushSubscription', () => {
  it('deletes the endpoint only when it belongs to the user', async () => {
    await deleteUserPushSubscription(ENDPOINT, 7)

    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('delete')
    expect(calls[0].target).toBe('push_subscriptions')
    expect(render(calls[0].steps.where)).toEqual({
      sql: '("push_subscriptions"."endpoint" = $1 and "push_subscriptions"."user_id" = $2)',
      params: [ENDPOINT, 7],
    })
  })
})

describe('deletePushSubscription', () => {
  it('deletes the endpoint whoever owns it', async () => {
    await deletePushSubscription(ENDPOINT)

    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('delete')
    expect(render(calls[0].steps.where)).toEqual({ sql: '"push_subscriptions"."endpoint" = $1', params: [ENDPOINT] })
  })
})

describe('deleteAllPushSubscriptions', () => {
  it('deletes every subscription', async () => {
    await deleteAllPushSubscriptions()

    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('delete')
    expect(calls[0].target).toBe('push_subscriptions')
    expect(calls[0].steps.where).toBeUndefined()
  })
})
