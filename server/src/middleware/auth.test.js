import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

const findUserById = vi.fn()
vi.mock('../db/users.js', () => ({ findUserById }))

const findActiveApiKeyByHash = vi.fn()
const touchApiKeyLastUsed = vi.fn()
vi.mock('../db/api-keys.js', () => ({ findActiveApiKeyByHash, touchApiKeyLastUsed }))

const RESOURCE = 'https://soporti.test/api/mcp'
const RESOURCE_METADATA_URL = 'https://soporti.test/.well-known/oauth-protected-resource/api/mcp'

vi.mock('../oauth/metadata.js', () => ({
  mcpResourceUri: () => RESOURCE,
  protectedResourceMetadataUrl: () => RESOURCE_METADATA_URL,
}))

const { createSession, getSessionUser, requireAuth, requireAdmin } = await import('./auth.js')
const { hashApiKey } = await import('../auth/api-key.js')
const { issueAccessToken } = await import('../oauth/tokens.js')
const { default: config } = await import('../config.js')

function mockReq(overrides = {}) {
  return {
    path: '/api/chat',
    method: 'POST',
    headers: {},
    ...overrides,
  }
}

function mockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    _headers: {},
    set(name, value) {
      res._headers[name] = value
      return res
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(data) {
      res._json = data
      return res
    },
  }
  return res
}

const sampleUser = { id: 1, email: 'jane@example.com', name: 'Jane', role: 'user' }

beforeEach(() => {
  findUserById.mockReset()
  findActiveApiKeyByHash.mockReset()
  touchApiKeyLastUsed.mockReset()
  touchApiKeyLastUsed.mockResolvedValue(undefined)
})

describe('createSession / getSessionUser', () => {
  it('issues a signed JWT (three dot-separated segments)', () => {
    const token = createSession(sampleUser)
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)
  })

  it('resolves a valid token back to its user identity including role', () => {
    const token = createSession({ ...sampleUser, role: 'admin' })
    expect(getSessionUser(token)).toEqual({ ...sampleUser, role: 'admin' })
  })

  it('defaults the role to user when the user has none', () => {
    const token = createSession({ id: 1, email: 'jane@example.com', name: 'Jane' })
    expect(getSessionUser(token).role).toBe('user')
  })

  it('treats legacy tokens without a role claim as user', () => {
    const legacy = jwt.sign({ id: 1, email: 'jane@example.com', name: 'Jane' }, process.env.JWT_SECRET)
    expect(getSessionUser(legacy)).toEqual(sampleUser)
  })

  it('returns null for a malformed token', () => {
    expect(getSessionUser('nope')).toBeNull()
  })

  it('returns null for a token signed with a different secret', () => {
    const forged = jwt.sign({ id: 1, email: 'x@example.com' }, 'wrong-secret')
    expect(getSessionUser(forged)).toBeNull()
  })

  it('rejects tokens signed with a non-HS256 algorithm, even with the right secret', () => {
    const hs512 = jwt.sign({ id: 1, email: 'x@example.com' }, process.env.JWT_SECRET, { algorithm: 'HS512' })
    expect(getSessionUser(hs512)).toBeNull()
  })
})

describe('requireAuth', () => {
  it.each([
    ['POST', '/api/auth/google'],
    ['POST', '/api/auth/login'],
    ['GET', '/api/auth/methods'],
    ['GET', '/api/health'],
    ['GET', '/api/admin/status'],
    ['POST', '/api/admin/bootstrap'],
    ['GET', '/api/oauth/authorize'],
    ['POST', '/api/oauth/register'],
    ['POST', '/api/oauth/token'],
  ])('skips auth for %s %s', async (method, path) => {
    const req = mockReq({ path, method })
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('skips auth for GET /api/share/:id', async () => {
    const req = mockReq({ path: '/api/share/abc123', method: 'GET' })
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('requires auth for POST /api/share', async () => {
    const req = mockReq({ path: '/api/share', method: 'POST' })
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('requires auth for public paths hit with the wrong method', async () => {
    const req = mockReq({ path: '/api/admin/status', method: 'POST' })
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when no Authorization header', async () => {
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(res._json.error).toContain('Authentication required')
  })

  it('returns 401 for invalid token', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer invalid-token' } })
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(res._json.error).toContain('Invalid or expired')
  })

  it('allows a valid token and attaches req.user', async () => {
    const token = createSession(sampleUser)
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } })
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.user).toEqual(sampleUser)
    expect(req.apiKey).toBeUndefined()
    expect(findActiveApiKeyByHash).not.toHaveBeenCalled()
  })

  it('returns 401 for malformed auth header', async () => {
    const req = mockReq({ headers: { authorization: 'Basic abc123' } })
    const res = mockRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(res.statusCode).toBe(401)
  })
})

describe('requireAuth with an API key', () => {
  const activeKey = {
    id: 9,
    sources: ['integration:notion'],
    userId: 1,
    email: 'jane@example.com',
    name: 'Jane',
    role: 'user',
  }

  it('resolves the key to its owner and exposes the source scope', async () => {
    findActiveApiKeyByHash.mockResolvedValue(activeKey)
    const req = mockReq({ headers: { authorization: 'Bearer sop_abcd1234secret' } })
    const res = mockRes()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(req.user).toEqual(sampleUser)
    expect(req.apiKey).toEqual({ id: 9, sources: ['integration:notion'] })
  })

  it('looks the key up by its SHA-256 hash, never by the plaintext', async () => {
    findActiveApiKeyByHash.mockResolvedValue(activeKey)
    const req = mockReq({ headers: { authorization: 'Bearer sop_abcd1234secret' } })

    await requireAuth(req, mockRes(), vi.fn())

    expect(findActiveApiKeyByHash).toHaveBeenCalledWith(hashApiKey('sop_abcd1234secret'))
    expect(findActiveApiKeyByHash).not.toHaveBeenCalledWith('sop_abcd1234secret')
  })

  it('records the usage on every request', async () => {
    findActiveApiKeyByHash.mockResolvedValue(activeKey)

    await requireAuth(mockReq({ headers: { authorization: 'Bearer sop_a' } }), mockRes(), vi.fn())
    await requireAuth(mockReq({ headers: { authorization: 'Bearer sop_a' } }), mockRes(), vi.fn())

    expect(touchApiKeyLastUsed).toHaveBeenCalledTimes(2)
    expect(touchApiKeyLastUsed).toHaveBeenCalledWith(9)
  })

  it('defaults the role to user and the scope to an empty list', async () => {
    findActiveApiKeyByHash.mockResolvedValue({ ...activeKey, role: null, sources: null })
    const req = mockReq({ headers: { authorization: 'Bearer sop_abcd1234secret' } })

    await requireAuth(req, mockRes(), vi.fn())

    expect(req.user.role).toBe('user')
    expect(req.apiKey.sources).toEqual([])
  })

  it('returns 401 for an unknown or revoked key', async () => {
    findActiveApiKeyByHash.mockResolvedValue(null)
    const req = mockReq({ headers: { authorization: 'Bearer sop_revoked' } })
    const res = mockRes()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res._json.error).toContain('Invalid or revoked API key')
    expect(touchApiKeyLastUsed).not.toHaveBeenCalled()
  })

  it('forwards DB errors to next instead of authenticating', async () => {
    const dbErr = new Error('db down')
    findActiveApiKeyByHash.mockRejectedValue(dbErr)
    const req = mockReq({ headers: { authorization: 'Bearer sop_abcd1234secret' } })
    const res = mockRes()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(next).toHaveBeenCalledWith(dbErr)
    expect(req.user).toBeUndefined()
  })
})

describe('requireAuth with an OAuth access token', () => {
  const dbUser = { id: 1, email: 'jane@example.com', name: 'Jane', role: 'user' }

  function mcpReq(token) {
    return mockReq({ path: '/api/mcp', method: 'POST', headers: { authorization: `Bearer ${token}` } })
  }

  it('resolves the token subject to its owner, refreshed from the database', async () => {
    findUserById.mockResolvedValue({ ...dbUser, name: 'Renamed' })
    const req = mcpReq(issueAccessToken({ userId: 1, clientId: 'cid', scope: 'mcp' }))
    const next = vi.fn()

    await requireAuth(req, mockRes(), next)

    expect(next).toHaveBeenCalledWith()
    expect(req.user).toEqual({ ...dbUser, name: 'Renamed' })
    expect(req.apiKey).toBeUndefined()
    expect(findUserById).toHaveBeenCalledWith(1)
  })

  it('rejects a token minted for another audience', async () => {
    const foreign = jwt.sign({ scope: 'mcp' }, process.env.JWT_SECRET, {
      subject: '1',
      audience: 'https://evil.test/api/mcp',
      issuer: config.publicUrl,
      expiresIn: 900,
    })
    const res = mockRes()

    await requireAuth(mcpReq(foreign), res, vi.fn())

    expect(res.statusCode).toBe(401)
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('refuses to accept an MCP token anywhere else in the API', async () => {
    const req = mockReq({
      path: '/api/skills',
      method: 'GET',
      headers: { authorization: `Bearer ${issueAccessToken({ userId: 1, clientId: 'cid', scope: 'mcp' })}` },
    })
    const res = mockRes()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res._json.error).toContain('only valid for the MCP endpoint')
  })

  it('returns 401 when the account behind the token is gone', async () => {
    findUserById.mockResolvedValue(null)
    const res = mockRes()

    await requireAuth(mcpReq(issueAccessToken({ userId: 1, clientId: 'cid', scope: 'mcp' })), res, vi.fn())

    expect(res.statusCode).toBe(401)
    expect(res._json.error).toContain('no longer exists')
  })

  it('forwards DB errors to next instead of authenticating', async () => {
    const dbErr = new Error('db down')
    findUserById.mockRejectedValue(dbErr)
    const req = mcpReq(issueAccessToken({ userId: 1, clientId: 'cid', scope: 'mcp' }))
    const next = vi.fn()

    await requireAuth(req, mockRes(), next)

    expect(next).toHaveBeenCalledWith(dbErr)
    expect(req.user).toBeUndefined()
  })

  it('never lets an MCP access token pass as a web session', async () => {
    expect(getSessionUser(issueAccessToken({ userId: 1, clientId: 'cid', scope: 'mcp' }))).toBeNull()
  })
})

describe('the MCP 401 challenge', () => {
  it('tells the client where the protected resource metadata lives', async () => {
    const res = mockRes()

    await requireAuth(mockReq({ path: '/api/mcp', method: 'POST' }), res, vi.fn())

    expect(res.statusCode).toBe(401)
    expect(res._headers['WWW-Authenticate']).toBe(`Bearer resource_metadata="${RESOURCE_METADATA_URL}"`)
  })

  it('is not sent on the other endpoints', async () => {
    const res = mockRes()

    await requireAuth(mockReq({ path: '/api/chat', method: 'POST' }), res, vi.fn())

    expect(res.statusCode).toBe(401)
    expect(res._headers['WWW-Authenticate']).toBeUndefined()
  })
})

describe('requireAdmin', () => {
  it('allows a user whose DB role is admin', async () => {
    findUserById.mockResolvedValue({ id: 1, role: 'admin' })
    const req = mockReq({ user: { id: 1, role: 'admin' } })
    const res = mockRes()
    const next = vi.fn()
    await requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledWith()
    expect(findUserById).toHaveBeenCalledWith(1)
  })

  it('allows an admin carrying a stale token without the role claim (DB is authoritative)', async () => {
    findUserById.mockResolvedValue({ id: 1, role: 'admin' })
    const req = mockReq({ user: { id: 1, role: 'user' } })
    const res = mockRes()
    const next = vi.fn()
    await requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('rejects a non-admin user with 403', async () => {
    findUserById.mockResolvedValue({ id: 2, role: 'user' })
    const req = mockReq({ user: { id: 2, role: 'admin' } })
    const res = mockRes()
    const next = vi.fn()
    await requireAdmin(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it('rejects when the user no longer exists in the DB', async () => {
    findUserById.mockResolvedValue(null)
    const req = mockReq({ user: { id: 3, role: 'admin' } })
    const res = mockRes()
    const next = vi.fn()
    await requireAdmin(req, res, next)
    expect(res.statusCode).toBe(403)
  })

  it('rejects when req.user is missing', async () => {
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn()
    await requireAdmin(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('forwards DB errors to next', async () => {
    const dbErr = new Error('db down')
    findUserById.mockRejectedValue(dbErr)
    const req = mockReq({ user: { id: 1 } })
    const res = mockRes()
    const next = vi.fn()
    await requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledWith(dbErr)
  })
})
