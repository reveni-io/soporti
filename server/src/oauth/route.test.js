import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'node:crypto'

vi.mock('../config.js', () => ({
  default: { publicUrl: 'https://soporti.test', jwt: { secret: 'test-secret', expiresIn: '24h' } },
}))
vi.mock('./clients.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, getClient: vi.fn(), registerClient: vi.fn() }
})
vi.mock('./codes.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, issueAuthorizationCode: vi.fn(), redeemAuthorizationCode: vi.fn() }
})
vi.mock('./tokens.js', () => ({
  issueAccessToken: vi.fn(() => 'the-access-token'),
  issueRefreshToken: vi.fn(async () => 'the-refresh-token'),
  rotateRefreshToken: vi.fn(),
}))

const { getClient, registerClient } = await import('./clients.js')
const { issueAuthorizationCode, redeemAuthorizationCode } = await import('./codes.js')
const { issueAccessToken, issueRefreshToken, rotateRefreshToken } = await import('./tokens.js')
const { default: oauthRouter } = await import('./route.js')

const CHALLENGE = createHash('sha256').update('a'.repeat(64)).digest('base64url')
const CLIENT = { clientId: 'cid', name: 'Claude Code', redirectUris: ['https://claude.ai/cb'] }
const RESOURCE = 'https://soporti.test/api/mcp'

const AUTHORIZE_QUERY = {
  response_type: 'code',
  client_id: 'cid',
  redirect_uri: 'https://claude.ai/cb',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  state: 'xyz',
}

function buildApp(authContext = { user: { id: 7 } }) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.assign(req, authContext)
    next()
  })
  app.use('/api/oauth', oauthRouter)
  return app
}

let app

beforeEach(() => {
  vi.clearAllMocks()
  issueAccessToken.mockReturnValue('the-access-token')
  issueRefreshToken.mockResolvedValue('the-refresh-token')
  getClient.mockResolvedValue(CLIENT)
  app = buildApp()
})

describe('POST /api/oauth/register', () => {
  it('registers a public client and returns its id without any secret', async () => {
    registerClient.mockResolvedValue({
      clientId: 'generated',
      name: 'Claude Code',
      redirectUris: ['https://claude.ai/cb'],
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })

    const res = await request(app)
      .post('/api/oauth/register')
      .send({ client_name: 'Claude Code', redirect_uris: ['https://claude.ai/cb'] })

    expect(res.status).toBe(201)
    expect(res.body.client_id).toBe('generated')
    expect(res.body.token_endpoint_auth_method).toBe('none')
    expect(res.body.grant_types).toEqual(['authorization_code', 'refresh_token'])
    expect(res.body.client_secret).toBeUndefined()
    expect(registerClient).toHaveBeenCalledWith({ name: 'Claude Code', redirectUris: ['https://claude.ai/cb'] })
  })

  it('rejects invalid client metadata with the RFC error code', async () => {
    const res = await request(app)
      .post('/api/oauth/register')
      .send({ redirect_uris: ['http://evil.test/cb'] })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_client_metadata')
    expect(registerClient).not.toHaveBeenCalled()
  })

  it('reports a storage failure as a server error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    registerClient.mockRejectedValue(new Error('boom'))

    const res = await request(app)
      .post('/api/oauth/register')
      .send({ redirect_uris: ['https://claude.ai/cb'] })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('server_error')
  })
})

describe('GET /api/oauth/authorize', () => {
  it('redirects a valid request to the consent screen with the request carried over', async () => {
    const res = await request(app).get('/api/oauth/authorize').query(AUTHORIZE_QUERY)

    expect(res.status).toBe(302)
    const location = new URL(res.headers.location, 'https://soporti.test')
    expect(location.pathname).toBe('/oauth/consent')
    expect(location.searchParams.get('client_id')).toBe('cid')
    expect(location.searchParams.get('client_name')).toBe('Claude Code')
    expect(location.searchParams.get('redirect_uri')).toBe('https://claude.ai/cb')
    expect(location.searchParams.get('code_challenge')).toBe(CHALLENGE)
    expect(location.searchParams.get('state')).toBe('xyz')
    expect(location.searchParams.get('resource')).toBe(RESOURCE)
  })

  it('never redirects when the client is unknown', async () => {
    getClient.mockResolvedValue(null)

    const res = await request(app).get('/api/oauth/authorize').query(AUTHORIZE_QUERY)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_request')
  })

  it('never redirects when the redirect_uri is not registered', async () => {
    const res = await request(app)
      .get('/api/oauth/authorize')
      .query({ ...AUTHORIZE_QUERY, redirect_uri: 'https://evil.test/cb' })

    expect(res.status).toBe(400)
    expect(res.body.error_description).toMatch(/redirect_uri is not registered/)
  })

  it('reports an unsupported response type back to the client', async () => {
    const res = await request(app)
      .get('/api/oauth/authorize')
      .query({ ...AUTHORIZE_QUERY, response_type: 'token' })

    expect(res.status).toBe(302)
    const location = new URL(res.headers.location)
    expect(location.searchParams.get('error')).toBe('unsupported_response_type')
    expect(location.searchParams.get('state')).toBe('xyz')
  })

  it('reports a missing PKCE challenge back to the client', async () => {
    const res = await request(app)
      .get('/api/oauth/authorize')
      .query({ ...AUTHORIZE_QUERY, code_challenge: undefined, code_challenge_method: undefined })

    expect(res.status).toBe(302)
    expect(new URL(res.headers.location).searchParams.get('error')).toBe('invalid_request')
  })

  it('reports a resource that is not the MCP endpoint back to the client', async () => {
    const res = await request(app)
      .get('/api/oauth/authorize')
      .query({ ...AUTHORIZE_QUERY, resource: 'https://evil.test/api/mcp' })

    expect(res.status).toBe(302)
    expect(new URL(res.headers.location).searchParams.get('error')).toBe('invalid_target')
  })

  it('reports a lookup failure as a server error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getClient.mockRejectedValue(new Error('boom'))

    const res = await request(app).get('/api/oauth/authorize').query(AUTHORIZE_QUERY)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('server_error')
  })
})

describe('POST /api/oauth/authorize', () => {
  const body = {
    client_id: 'cid',
    redirect_uri: 'https://claude.ai/cb',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'xyz',
    resource: RESOURCE,
  }

  it('issues a code for the signed-in user and returns where to send the browser', async () => {
    issueAuthorizationCode.mockResolvedValue('the-code')

    const res = await request(app).post('/api/oauth/authorize').send(body)

    expect(res.status).toBe(200)
    const redirect = new URL(res.body.redirectTo)
    expect(redirect.origin + redirect.pathname).toBe('https://claude.ai/cb')
    expect(redirect.searchParams.get('code')).toBe('the-code')
    expect(redirect.searchParams.get('state')).toBe('xyz')
    expect(issueAuthorizationCode).toHaveBeenCalledWith({
      clientId: 'cid',
      userId: 7,
      redirectUri: 'https://claude.ai/cb',
      codeChallenge: CHALLENGE,
      scope: 'mcp',
      resource: RESOURCE,
    })
  })

  it('returns an access_denied redirect when the user refuses', async () => {
    const res = await request(app)
      .post('/api/oauth/authorize')
      .send({ ...body, decision: 'deny' })

    expect(res.status).toBe(200)
    expect(new URL(res.body.redirectTo).searchParams.get('error')).toBe('access_denied')
    expect(issueAuthorizationCode).not.toHaveBeenCalled()
  })

  it('re-validates the redirect_uri instead of trusting the consent screen', async () => {
    const res = await request(app)
      .post('/api/oauth/authorize')
      .send({ ...body, redirect_uri: 'https://evil.test/cb' })

    expect(res.status).toBe(400)
    expect(issueAuthorizationCode).not.toHaveBeenCalled()
  })

  it('rejects a challenge that is not S256', async () => {
    const res = await request(app)
      .post('/api/oauth/authorize')
      .send({ ...body, code_challenge_method: 'plain' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_request')
  })

  it('rejects an unsupported scope', async () => {
    const res = await request(app)
      .post('/api/oauth/authorize')
      .send({ ...body, scope: 'admin' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_scope')
  })

  it('refuses to let an API key authorize a client', async () => {
    const res = await request(buildApp({ user: { id: 7 }, apiKey: { id: 1, sources: [] } }))
      .post('/api/oauth/authorize')
      .send(body)

    expect(res.status).toBe(403)
    expect(issueAuthorizationCode).not.toHaveBeenCalled()
  })

  it('reports an issuing failure as a server error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    issueAuthorizationCode.mockRejectedValue(new Error('boom'))

    const res = await request(app).post('/api/oauth/authorize').send(body)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('server_error')
  })
})

describe('POST /api/oauth/token', () => {
  it('exchanges a form-encoded authorization code for both tokens', async () => {
    redeemAuthorizationCode.mockResolvedValue({ value: { userId: 7, scope: 'mcp' } })

    const res = await request(app)
      .post('/api/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'the-code',
        redirect_uri: 'https://claude.ai/cb',
        client_id: 'cid',
        code_verifier: 'a'.repeat(64),
      })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      access_token: 'the-access-token',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'the-refresh-token',
      scope: 'mcp',
    })
    expect(res.headers['cache-control']).toBe('no-store')
    expect(issueAccessToken).toHaveBeenCalledWith({ userId: 7, clientId: 'cid', scope: 'mcp' })
  })

  it('rotates a refresh token into a new pair', async () => {
    rotateRefreshToken.mockResolvedValue({ value: { userId: 7, scope: 'mcp', refreshToken: 'rotated' } })

    const res = await request(app)
      .post('/api/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'old', client_id: 'cid' })

    expect(res.status).toBe(200)
    expect(res.body.refresh_token).toBe('rotated')
    expect(rotateRefreshToken).toHaveBeenCalledWith({ token: 'old', clientId: 'cid' })
  })

  it('rejects an unsupported grant type', async () => {
    const res = await request(app).post('/api/oauth/token').type('form').send({ grant_type: 'password' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('unsupported_grant_type')
    expect(getClient).not.toHaveBeenCalled()
  })

  it('rejects an unknown client', async () => {
    getClient.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'c', client_id: 'nope' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid_client')
  })

  it('rejects a code that failed redemption as an invalid grant', async () => {
    redeemAuthorizationCode.mockResolvedValue({ error: 'The code_verifier does not match the code_challenge.' })

    const res = await request(app)
      .post('/api/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'c', client_id: 'cid', code_verifier: 'bad' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_grant')
    expect(issueRefreshToken).not.toHaveBeenCalled()
  })

  it('rejects a replayed refresh token as an invalid grant', async () => {
    rotateRefreshToken.mockResolvedValue({ error: 'The refresh token was already used.' })

    const res = await request(app)
      .post('/api/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'used', client_id: 'cid' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_grant')
    expect(issueAccessToken).not.toHaveBeenCalled()
  })

  it('reports an issuing failure as a server error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    redeemAuthorizationCode.mockRejectedValue(new Error('boom'))

    const res = await request(app)
      .post('/api/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'c', client_id: 'cid' })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('server_error')
  })
})
