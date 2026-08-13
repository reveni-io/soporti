import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

vi.mock('../config.js', () => ({
  default: { publicUrl: 'https://soporti.test', jwt: { secret: 'test-secret', expiresIn: '24h' } },
}))
vi.mock('../db/oauth-refresh-tokens.js', () => ({
  createRefreshToken: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeRefreshTokensForGrant: vi.fn(),
}))

const { createRefreshToken, findRefreshTokenByHash, revokeRefreshToken, revokeRefreshTokensForGrant } =
  await import('../db/oauth-refresh-tokens.js')
const { issueAccessToken, issueRefreshToken, rotateRefreshToken, verifyAccessToken } = await import('./tokens.js')
const { hashSecret } = await import('./secrets.js')

const FUTURE = new Date(Date.now() + 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  revokeRefreshToken.mockResolvedValue(true)
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
    expect(payload.exp - payload.iat).toBe(900)
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
  it('revokes the presented token and returns a fresh one', async () => {
    findRefreshTokenByHash.mockResolvedValue({
      id: 3,
      clientId: 'cid',
      userId: 7,
      scope: 'mcp',
      revokedAt: null,
      expiresAt: FUTURE,
    })

    const result = await rotateRefreshToken({ token: 'the-token', clientId: 'cid' })

    expect(result.value.userId).toBe(7)
    expect(result.value.scope).toBe('mcp')
    expect(revokeRefreshToken).toHaveBeenCalledWith(3)
    expect(createRefreshToken.mock.calls[0][0].rotatedFromId).toBe(3)
    expect(result.value.refreshToken).not.toBe('the-token')
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
    findRefreshTokenByHash.mockResolvedValue({
      id: 3,
      clientId: 'other',
      userId: 7,
      revokedAt: null,
      expiresAt: FUTURE,
    })

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/not valid/)
  })

  it('revokes the whole grant when an already rotated token is replayed', async () => {
    findRefreshTokenByHash.mockResolvedValue({
      id: 3,
      clientId: 'cid',
      userId: 7,
      scope: 'mcp',
      revokedAt: new Date(),
      expiresAt: FUTURE,
    })

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/already used/)
    expect(revokeRefreshTokensForGrant).toHaveBeenCalledWith(7, 'cid')
    expect(createRefreshToken).not.toHaveBeenCalled()
  })

  it('revokes the whole grant when a concurrent request won the rotation', async () => {
    findRefreshTokenByHash.mockResolvedValue({
      id: 3,
      clientId: 'cid',
      userId: 7,
      scope: 'mcp',
      revokedAt: null,
      expiresAt: FUTURE,
    })
    revokeRefreshToken.mockResolvedValue(false)

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/already used/)
    expect(revokeRefreshTokensForGrant).toHaveBeenCalledWith(7, 'cid')
  })

  it('rejects an expired token', async () => {
    findRefreshTokenByHash.mockResolvedValue({
      id: 3,
      clientId: 'cid',
      userId: 7,
      scope: 'mcp',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    })

    expect((await rotateRefreshToken({ token: 'x', clientId: 'cid' })).error).toMatch(/expired/)
  })
})
