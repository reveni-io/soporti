import { describe, it, expect, beforeEach, vi } from 'vitest'

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
    returning: () => chain,
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

vi.mock('./index.js', () => ({
  getDb: () => ({
    select: () => makeChain('select'),
    insert: () => makeChain('insert'),
  }),
}))

const { createOAuthClient, findOAuthClient } = await import('./oauth-clients.js')

beforeEach(() => {
  queue = []
  calls = []
})

describe('createOAuthClient', () => {
  it('inserts the client and returns the stored row', async () => {
    const row = { clientId: 'cid', name: 'Claude', redirectUris: ['https://claude.ai/cb'] }
    queue = [[row]]

    expect(
      await createOAuthClient({ clientId: 'cid', name: 'Claude', redirectUris: ['https://claude.ai/cb'] })
    ).toEqual(row)
    expect(calls[0].op).toBe('insert')
    expect(calls[0].steps.values).toEqual({ clientId: 'cid', name: 'Claude', redirectUris: ['https://claude.ai/cb'] })
  })
})

describe('findOAuthClient', () => {
  it('returns the client when it exists', async () => {
    const row = { clientId: 'cid', name: 'Claude', redirectUris: [] }
    queue = [[row]]

    expect(await findOAuthClient('cid')).toEqual(row)
  })

  it('returns null when there is no such client', async () => {
    queue = [[]]

    expect(await findOAuthClient('missing')).toBeNull()
  })
})
