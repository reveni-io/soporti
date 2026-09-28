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
    set: v => {
      call.steps.set = v
      return chain
    },
    returning: () => chain,
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
    update: () => makeChain('update'),
    delete: () => makeChain('delete'),
  }),
}))

const { getZendeskConnection, saveZendeskCredentials, updateZendeskOptions, deleteZendeskConnection } =
  await import('./zendesk-connections.js')

const CONNECTION = {
  subdomain: 'acme',
  email: 'ana@acme.com',
  apiToken: 'abcdefghijklmnopqrstuvwxyz0123456789ABCD',
  writesEnabled: false,
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('getZendeskConnection', () => {
  it('returns the stored connection', async () => {
    queue = [[CONNECTION]]

    expect(await getZendeskConnection(7)).toEqual(CONNECTION)
  })

  it('returns null when the user has no row', async () => {
    queue = [[]]

    expect(await getZendeskConnection(7)).toBeNull()
  })
})

describe('saveZendeskCredentials', () => {
  it('upserts the credentials without touching the options and returns the row', async () => {
    queue = [[CONNECTION]]

    const row = await saveZendeskCredentials(7, {
      subdomain: 'acme',
      email: 'ana@acme.com',
      apiToken: CONNECTION.apiToken,
    })

    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toMatchObject({ userId: 7, subdomain: 'acme', apiToken: CONNECTION.apiToken })
    expect(insert.steps.onConflictDoUpdate.set).toMatchObject({ subdomain: 'acme', email: 'ana@acme.com' })
    expect(insert.steps.onConflictDoUpdate.set).not.toHaveProperty('writesEnabled')
    expect(row).toEqual(CONNECTION)
  })
})

describe('updateZendeskOptions', () => {
  it('returns the updated connection', async () => {
    queue = [[{ ...CONNECTION, writesEnabled: true }]]

    const row = await updateZendeskOptions(7, { writesEnabled: true })

    expect(row.writesEnabled).toBe(true)
    expect(calls.find(c => c.op === 'update').steps.set).toMatchObject({ writesEnabled: true })
  })

  it('returns null when the user is not connected', async () => {
    queue = [[]]

    expect(await updateZendeskOptions(7, { writesEnabled: true })).toBeNull()
  })
})

describe('deleteZendeskConnection', () => {
  it('deletes the row', async () => {
    await deleteZendeskConnection(7)

    expect(calls.filter(c => c.op === 'delete')).toHaveLength(1)
  })
})
