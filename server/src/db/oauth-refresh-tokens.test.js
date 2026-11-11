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

const db = {
  select: () => makeChain('select'),
  insert: () => makeChain('insert'),
  update: () => makeChain('update'),
  transaction: callback => callback(db),
}

vi.mock('./index.js', () => ({ getDb: () => db }))

const {
  createRefreshToken,
  findRefreshTokenByHash,
  hasActiveSuccessor,
  replaceRefreshToken,
  revokeRefreshTokensForGrant,
} = await import('./oauth-refresh-tokens.js')

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

describe('replaceRefreshToken', () => {
  const SUCCESSOR = { tokenHash: 'next-hash', clientId: 'cid', userId: 7, scope: 'mcp', expiresAt: EXPIRES_AT }

  it('revokes the active token and stores its successor', async () => {
    queue = [[{ id: 1 }], []]

    expect(await replaceRefreshToken(1, SUCCESSOR)).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0].op).toBe('update')
    expect(calls[0].steps.set.revokedAt).toBeInstanceOf(Date)
    expect(calls[1].op).toBe('insert')
    expect(calls[1].steps.values).toEqual({ ...SUCCESSOR, rotatedFromId: 1 })
  })

  it('stores nothing when the token was already revoked', async () => {
    queue = [[]]

    expect(await replaceRefreshToken(1, SUCCESSOR)).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('update')
  })
})

describe('hasActiveSuccessor', () => {
  it('reports whether a token rotated from it is still active', async () => {
    queue = [[{ id: 2 }], []]

    expect(await hasActiveSuccessor(1)).toBe(true)
    expect(await hasActiveSuccessor(1)).toBe(false)
    expect(calls.map(call => call.op)).toEqual(['select', 'select'])
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
