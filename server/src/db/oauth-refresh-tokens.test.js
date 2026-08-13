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
    select: () => makeChain('select'),
    insert: () => makeChain('insert'),
    update: () => makeChain('update'),
  }),
}))

const { createRefreshToken, findRefreshTokenByHash, revokeRefreshToken, revokeRefreshTokensForGrant } =
  await import('./oauth-refresh-tokens.js')

const EXPIRES_AT = new Date('2026-01-01T00:00:00Z')

beforeEach(() => {
  queue = []
  calls = []
})

describe('createRefreshToken', () => {
  it('records which token it was rotated from', async () => {
    queue = [[{ id: 9 }]]

    const row = await createRefreshToken({
      tokenHash: 'hash',
      clientId: 'cid',
      userId: 7,
      scope: 'mcp',
      rotatedFromId: 4,
      expiresAt: EXPIRES_AT,
    })

    expect(row).toEqual({ id: 9 })
    expect(calls[0].steps.values.rotatedFromId).toBe(4)
  })

  it('stores a null origin for the first token of a grant', async () => {
    queue = [[{ id: 1 }]]

    await createRefreshToken({ tokenHash: 'h', clientId: 'cid', userId: 7, scope: 'mcp', expiresAt: EXPIRES_AT })

    expect(calls[0].steps.values.rotatedFromId).toBeNull()
  })
})

describe('findRefreshTokenByHash', () => {
  it('returns the row when it exists', async () => {
    queue = [[{ id: 1, userId: 7, clientId: 'cid', scope: 'mcp', revokedAt: null, expiresAt: EXPIRES_AT }]]

    expect((await findRefreshTokenByHash('hash')).id).toBe(1)
  })

  it('returns null when there is no such token', async () => {
    queue = [[]]

    expect(await findRefreshTokenByHash('hash')).toBeNull()
  })
})

describe('revokeRefreshToken', () => {
  it('reports whether an active token was revoked', async () => {
    queue = [[{ id: 1 }], []]

    expect(await revokeRefreshToken(1)).toBe(true)
    expect(await revokeRefreshToken(1)).toBe(false)
    expect(calls[0].steps.set.revokedAt).toBeInstanceOf(Date)
  })
})

describe('revokeRefreshTokensForGrant', () => {
  it('revokes every active token of the user and client', async () => {
    queue = [[]]

    await revokeRefreshTokensForGrant(7, 'cid')

    expect(calls[0].op).toBe('update')
    expect(calls[0].steps.set.revokedAt).toBeInstanceOf(Date)
  })
})
