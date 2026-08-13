import { describe, it, expect, beforeEach, vi } from 'vitest'

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    where: () => chain,
    set: v => {
      call.steps.set = v
      return chain
    },
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
    insert: () => makeChain('insert'),
    update: () => makeChain('update'),
  }),
}))

const { createAuthorizationCode, consumeAuthorizationCode } = await import('./oauth-codes.js')

const EXPIRES_AT = new Date('2026-01-01T00:00:00Z')

beforeEach(() => {
  queue = []
  calls = []
})

describe('createAuthorizationCode', () => {
  it('stores every grant detail and returns the new id', async () => {
    queue = [[{ id: 3 }]]

    const row = await createAuthorizationCode({
      codeHash: 'hash',
      clientId: 'cid',
      userId: 7,
      redirectUri: 'https://claude.ai/cb',
      codeChallenge: 'challenge',
      scope: 'mcp',
      resource: 'https://soporti.test/api/mcp',
      expiresAt: EXPIRES_AT,
    })

    expect(row).toEqual({ id: 3 })
    expect(calls[0].steps.values).toEqual({
      codeHash: 'hash',
      clientId: 'cid',
      userId: 7,
      redirectUri: 'https://claude.ai/cb',
      codeChallenge: 'challenge',
      scope: 'mcp',
      resource: 'https://soporti.test/api/mcp',
      expiresAt: EXPIRES_AT,
    })
  })
})

describe('consumeAuthorizationCode', () => {
  it('marks the code as used and returns the grant', async () => {
    queue = [[{ clientId: 'cid', userId: 7, redirectUri: 'https://claude.ai/cb', codeChallenge: 'c', scope: 'mcp' }]]

    const grant = await consumeAuthorizationCode('hash')

    expect(grant.userId).toBe(7)
    expect(calls[0].op).toBe('update')
    expect(calls[0].steps.set.usedAt).toBeInstanceOf(Date)
  })

  it('returns null when the code was already used or expired', async () => {
    queue = [[]]

    expect(await consumeAuthorizationCode('hash')).toBeNull()
  })
})
