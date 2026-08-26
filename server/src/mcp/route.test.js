import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('@modelcontextprotocol/server', () => ({ createMcpHandler: vi.fn() }))
vi.mock('./server.js', () => ({ createSoportiMcpServer: vi.fn(() => 'mcp-server-instance') }))

const { createMcpHandler } = await import('@modelcontextprotocol/server')
const { createSoportiMcpServer } = await import('./server.js')
const { default: mcpRoute } = await import('./route.js')
const { McpJobStore } = await import('./jobs.js')

const USER = { id: 7, email: 'jose@reveni.io', name: 'Jose', role: 'user' }
const CONVERSATION_STORE = { resolveWeb: vi.fn(), saveTurn: vi.fn() }

function makeApp({ user = USER, apiKey } = {}) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = user
    req.apiKey = apiKey
    next()
  })
  app.use('/api/mcp', mcpRoute(CONVERSATION_STORE))
  return app
}

let fetchMock

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock = vi.fn(
    async () => new Response('{"jsonrpc":"2.0"}', { status: 200, headers: { 'content-type': 'application/json' } })
  )
  createMcpHandler.mockReturnValue({ fetch: fetchMock })
})

describe('mcpRoute', () => {
  it('creates a stateless dual-era handler that streams responses', () => {
    const jobs = new McpJobStore()

    mcpRoute(CONVERSATION_STORE, jobs)

    const [factory, options] = createMcpHandler.mock.calls[0]
    expect(options).toMatchObject({ legacy: 'stateless', responseMode: 'sse', keepAliveMs: 15_000 })
    expect(options.onerror).toBeInstanceOf(Function)

    factory({ authInfo: { extra: { user: USER, apiKey: undefined } } })
    expect(createSoportiMcpServer).toHaveBeenCalledWith({
      user: USER,
      apiKey: undefined,
      conversationStore: CONVERSATION_STORE,
      jobs,
    })
  })

  it('forwards the request with the parsed body and the authenticated user', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
    const apiKey = { id: 4, sources: ['integration:notion'] }

    await request(makeApp({ apiKey })).post('/api/mcp').set('mcp-protocol-version', '2026-07-28').send(body)

    const [webRequest, options] = fetchMock.mock.calls[0]
    expect(webRequest.method).toBe('POST')
    expect(new URL(webRequest.url).pathname).toBe('/api/mcp')
    expect(webRequest.headers.get('mcp-protocol-version')).toBe('2026-07-28')
    expect(options.parsedBody).toEqual(body)
    expect(options.authInfo).toEqual({
      token: '',
      clientId: '7',
      scopes: ['integration:notion'],
      extra: { user: USER, apiKey },
    })
  })

  it('sends no parsed body for bodyless methods', async () => {
    await request(makeApp()).get('/api/mcp')

    const [webRequest, options] = fetchMock.mock.calls[0]
    expect(webRequest.method).toBe('GET')
    expect(options.parsedBody).toBeUndefined()
    expect(options.authInfo.scopes).toEqual([])
  })

  it('copies the status, headers and body of the handler response', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"jsonrpc":"2.0","error":{"code":-32000,"message":"Method not allowed."},"id":null}', {
        status: 405,
        headers: { 'content-type': 'application/json', allow: 'POST' },
      })
    )

    const res = await request(makeApp()).get('/api/mcp')

    expect(res.status).toBe(405)
    expect(res.headers.allow).toBe('POST')
    expect(res.body.error.message).toBe('Method not allowed.')
    expect(res.headers['x-accel-buffering']).toBeUndefined()
  })

  it('disables proxy buffering on event streams', async () => {
    fetchMock.mockResolvedValue(
      new Response('data: {"jsonrpc":"2.0","id":1,"result":{}}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    )

    const res = await request(makeApp()).post('/api/mcp').send({ jsonrpc: '2.0', id: 1, method: 'ping' })

    expect(res.headers['x-accel-buffering']).toBe('no')
    expect(res.text).toContain('"id":1')
  })

  it('answers an empty handler response without a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }))

    const res = await request(makeApp()).post('/api/mcp').send({ jsonrpc: '2.0', method: 'notifications/initialized' })

    expect(res.status).toBe(202)
    expect(res.text).toBe('')
  })

  it('returns a generic 500 when the handler throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockRejectedValue(new Error('boom'))

    const res = await request(makeApp()).post('/api/mcp').send({ jsonrpc: '2.0', id: 1, method: 'ping' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error.' })
  })
})
