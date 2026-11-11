import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

vi.mock('../config.js', () => ({
  default: { publicUrl: 'https://soporti.test', jwt: { secret: 'test-secret', expiresIn: '24h' } },
}))
vi.mock('../db/oauth-refresh-tokens.js', () => ({
  createRefreshToken: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  hasActiveSuccessor: vi.fn(),
  replaceRefreshToken: vi.fn(),
  revokeRefreshTokensForGrant: vi.fn(),
}))

const {
  createRefreshToken,
  findRefreshTokenByHash,
  hasActiveSuccessor,
  replaceRefreshToken,
  revokeRefreshTokensForGrant,
} = await import('../db/oauth-refresh-tokens.js')
const { issueAccessToken, issueRefreshToken, rotateRefreshToken, verifyAccessToken } = await import('./tokens.js')
const { hashSecret } = await import('./secrets.js')

const FUTURE = new Date(Date.now() + 60_000)
const STORED = { id: 3, clientId: 'cid', userId: 7, scope: 'mcp', revokedAt: null, expiresAt: FUTURE }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  replaceRefreshToken.mockResolvedValue(true)
  hasActiveSuccessor.mockResolvedValue(false)
})

describe('issueAccessToken', () => {
  it('binds the token to the MCP resource and to the user', () => {
    const token = issueAccessToken({ userId: 7, clientId: 'cid', scope: 'mcp' })
    const payload = jwt.decode(token)

    expect(payload.aud).toBe('https://soporti.test/api/mcp')
    expect(payload.iss).toBe('https://soporti.test')
    expect(payload.sub).toBe('7')
    expect(payload.client_id).toBe('cid')
    expect(payload.scope).toBe('mcp')
    expect(payload.exp - payload.iat).toBe(3600)
  })
})

describe('verifyAccessToken', () => {
  it('accepts a token it issued itself', () => {
    const token = issueAccessToken({ userId: 7, clientId: 'cid', scope: 'mcp' })

    expect(verifyAccessToken(token)).toEqual({ userId: 7, clientId: 'cid', scope: 'mcp' })
  })

  it('rejects a token minted for another audience', () => {
    const token = jwt.sign({ scope: 'mcp' }, 'test-secret', {
      subject: '7',
      audience: 'https://evil.test/api/mcp',
      issuer: 'https://soporti.test',
      expiresIn: 900,
    })

    expect(verifyAccessToken(token)).toBeNull()
  })

  it('rejects a token issued by somebody else', () => {
    const token = jwt.sign({ scope: 'mcp' }, 'test-secret', {
      subject: '7',
      audience: 'https://soporti.test/api/mcp',
      issuer: 'https://evil.test',
      expiresIn: 900,
    })

    expect(verifyAccessToken(token)).toBeNull()
  })

  it('rejects a session token, which carries no audience', () => {
    expect(verifyAccessToken(jwt.sign({ id: 7, email: 'a@b.test' }, 'test-secret', { expiresIn: '24h' }))).toBeNull()
  })

  it('rejects a token signed with another secret and an expired one', () => {
    const foreign = jwt.sign({}, 'another-secret', {
      subject: '7',
      audience: 'https://soporti.test/api/mcp',
      issuer: 'https://soporti.test',
      expiresIn: 900,
    })
    const expired = jwt.sign({}, 'test-secret', {
      subject: '7',
      audience: 'https://soporti.test/api/mcp',
      issuer: 'https://soporti.test',
      expiresIn: -10,
    })

    expect(verifyAccessToken(foreign)).toBeNull()
    expect(verifyAccessToken(expired)).toBeNull()
  })

  it('rejects a token whose subject is not a user id', () => {
    const token = jwt.sign({}, 'test-secret', {
      subject: 'not-a-number',
      audience: 'https://soporti.test/api/mcp',
      issuer: 'https://soporti.test',
      expiresIn: 900,
    })

    expect(verifyAccessToken(token)).toBeNull()
  })
})

describe('issueRefreshToken', () => {
  it('persists only the hash and returns the opaque token', async () => {
    const token = await issueRefreshToken({ clientId: 'cid', userId: 7, scope: 'mcp' })

    const [stored] = createRefreshToken.mock.calls[0]
    expect(stored.tokenHash).toBe(hashSecret(token))
    expect(stored.tokenHash).not.toBe(token)
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('rotateRefreshToken', () => {
  it('replaces the presented token with a fresh one in a single step', async () => {
    findRefreshTokenByHash.mockResolvedValue(STORED)

    const result = await rotateRefreshToken({ token: 'the-token', clientId: 'cid' })

    expect(result.value.userId).toBe(7)
    expect(result.value.scope).toBe('mcp')
    expect(result.value.refreshToken).not.toBe('the-token')
    expect(findRefreshTokenByHash).toHaveBeenCalledWith(hashSecret('the-token'))
    expect(replaceRefreshToken).toHaveBeenCalledTimes(1)
    const [replacedId, successor] = replaceRefreshToken.mock.calls[0]
    expect(replacedId).toBe(3)
    expect(successor).toEqual({
      tokenHash: hashSecret(result.value.refreshToken),
      clientId: 'cid',
      userId: 7,
      scope: 'mcp',
      expiresAt: expect.any(Date),
    })
    expect(successor.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(createRefreshToken).not.toHaveBeenCalled()
  })

  it('rejects a missing token without querying', async () => {
    expect((await rotateRefreshToken({ clientId: 'cid' })).error).toMatch(/missing/)
    expect(findRefreshTokenByHash).not.toHaveBeenCalled()
  })

  it('rejects an unknown token', async () => {
    findRefreshTokenByHash.mockResolvedValue(null)

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/not valid/)
  })

  it('rejects a token that belongs to another client', async () => {
    findRefreshTokenByHash.mockResolvedValue({ ...STORED, clientId: 'other' })

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/not valid/)
    expect(replaceRefreshToken).not.toHaveBeenCalled()
  })

  it('revokes the whole grant when a token rotated over a minute ago is replayed', async () => {
    findRefreshTokenByHash.mockResolvedValue({ ...STORED, revokedAt: new Date(Date.now() - 10 * 60_000) })
    hasActiveSuccessor.mockResolvedValue(true)

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/already used/)
    expect(revokeRefreshTokensForGrant).toHaveBeenCalledTimes(1)
    expect(revokeRefreshTokensForGrant).toHaveBeenCalledWith(7, 'cid')
    expect(createRefreshToken).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user 7 for client cid'))
  })

  it('issues another token when a just rotated token is replayed and its successor is still active', async () => {
    findRefreshTokenByHash.mockResolvedValue({ ...STORED, revokedAt: new Date(Date.now() - 5_000) })
    hasActiveSuccessor.mockResolvedValue(true)

    const result = await rotateRefreshToken({ token: 'x', clientId: 'cid' })

    expect(result.value).toEqual({ userId: 7, scope: 'mcp', refreshToken: expect.any(String) })
    expect(hasActiveSuccessor).toHaveBeenCalledWith(3)
    expect(createRefreshToken).toHaveBeenCalledTimes(1)
    expect(createRefreshToken.mock.calls[0][0]).toMatchObject({
      tokenHash: hashSecret(result.value.refreshToken),
      clientId: 'cid',
      userId: 7,
      rotatedFromId: 3,
    })
    expect(revokeRefreshTokensForGrant).not.toHaveBeenCalled()
  })

  it('revokes the whole grant when a just revoked token has no active successor', async () => {
    findRefreshTokenByHash.mockResolvedValue({ ...STORED, revokedAt: new Date(Date.now() - 5_000) })

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/already used/)
    expect(revokeRefreshTokensForGrant).toHaveBeenCalledWith(7, 'cid')
    expect(createRefreshToken).not.toHaveBeenCalled()
  })

  it('issues another token when a concurrent request won the rotation', async () => {
    findRefreshTokenByHash.mockResolvedValue(STORED)
    replaceRefreshToken.mockResolvedValue(false)
    hasActiveSuccessor.mockResolvedValue(true)

    const result = await rotateRefreshToken({ token: 'x', clientId: 'cid' })

    expect(result.value.userId).toBe(7)
    expect(createRefreshToken).toHaveBeenCalledTimes(1)
    expect(createRefreshToken.mock.calls[0][0].rotatedFromId).toBe(3)
    expect(revokeRefreshTokensForGrant).not.toHaveBeenCalled()
  })

  it('revokes the whole grant when the token was revoked concurrently without a successor', async () => {
    findRefreshTokenByHash.mockResolvedValue(STORED)
    replaceRefreshToken.mockResolvedValue(false)

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/already used/)
    expect(revokeRefreshTokensForGrant).toHaveBeenCalledWith(7, 'cid')
  })

  it('rejects an expired token', async () => {
    findRefreshTokenByHash.mockResolvedValue({ ...STORED, expiresAt: new Date(Date.now() - 1000) })

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/expired/)
    expect(replaceRefreshToken).not.toHaveBeenCalled()
  })
})
