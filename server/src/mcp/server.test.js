import { createServer } from 'node:http'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../llm/model.js', () => ({ isConfigured: vi.fn(async () => true) }))
vi.mock('./ask-soporti.js', async importOriginal => {
  const original = await importOriginal()
  return { ...original, executeAskSoporti: vi.fn(async () => 'The answer.') }
})

const { isConfigured } = await import('../llm/model.js')
const { executeAskSoporti } = await import('./ask-soporti.js')
const { default: mcpRoute } = await import('./route.js')

const USER = { id: 7, email: 'jose@reveni.io', name: 'Jose', role: 'user' }
const ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
}

function makeApp({ user = USER, apiKey } = {}) {
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use((req, _res, next) => {
    req.user = user
    req.apiKey = apiKey
    next()
  })
  app.use('/api/mcp', mcpRoute())
  return app
}

function legacyCall(args, meta = {}, id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'ask_soporti', arguments: args, _meta: meta },
  }
}

function listenOn(app) {
  const server = createServer(app)
  return new Promise(resolve => {
    server.listen(0, () => resolve(server))
  })
}

function closeServer(server) {
  server.closeAllConnections?.()
  return new Promise(resolve => server.close(resolve))
}

function fetchCall(port, body, signal) {
  return fetch(`http://127.0.0.1:${port}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
}

function sseData(text) {
  return text
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)))
}

function postCall(app, body, headers = {}) {
  return request(app).post('/api/mcp').set('accept', 'application/json, text/event-stream').set(headers).send(body)
}

beforeEach(() => {
  vi.clearAllMocks()
  isConfigured.mockResolvedValue(true)
  executeAskSoporti.mockResolvedValue('The answer.')
})

describe('mcp server', () => {
  it('answers a legacy tools/call with the agent answer', async () => {
    const res = await postCall(makeApp(), legacyCall({ question: 'What failed?' }))

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.headers['x-accel-buffering']).toBe('no')

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.content).toEqual([{ type: 'text', text: 'The answer.' }])
    expect(result.isError).toBeUndefined()
    expect(executeAskSoporti).toHaveBeenCalledWith({
      question: 'What failed?',
      sources: [],
      profile: undefined,
      skillIds: [],
      userId: 7,
      onProgress: expect.any(Function),
      signal: expect.any(AbortSignal),
    })
  })

  it('answers a modern tools/call carrying the 2026-07-28 envelope', async () => {
    const res = await postCall(
      makeApp(),
      legacyCall(
        { question: 'What failed?', sources: ['integration:sentry'], profile: 'tech', skillIds: [3] },
        ENVELOPE
      ),
      { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': 'ask_soporti' }
    )

    expect(res.status).toBe(200)
    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.content).toEqual([{ type: 'text', text: 'The answer.' }])
    expect(result.resultType).toBe('complete')
    expect(executeAskSoporti).toHaveBeenCalledWith({
      question: 'What failed?',
      sources: ['integration:sentry'],
      profile: 'tech',
      skillIds: [3],
      userId: 7,
      onProgress: expect.any(Function),
      signal: expect.any(AbortSignal),
    })
  })

  it('rejects a modern request without clientCapabilities with -32602', async () => {
    const res = await postCall(
      makeApp(),
      legacyCall({ question: 'What failed?' }, { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' }),
      { 'mcp-protocol-version': '2026-07-28' }
    )

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe(-32602)
    expect(executeAskSoporti).not.toHaveBeenCalled()
  })

  it('lists the ask_soporti tool', async () => {
    const res = await postCall(makeApp(), { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })

    const result = sseData(res.text).find(msg => msg.id === 2).result
    expect(result.tools).toHaveLength(1)
    expect(result.tools[0].name).toBe('ask_soporti')
    expect(result.tools[0].inputSchema.required).toEqual(['question'])
    expect(result.tools[0].annotations).toEqual({ readOnlyHint: true })
  })

  it('relays tool progress as notifications/progress on the stream', async () => {
    executeAskSoporti.mockImplementation(async ({ onProgress }) => {
      await onProgress('Consulting search_code...')
      await onProgress('search_code completed')
      return 'Done.'
    })

    const res = await postCall(makeApp(), legacyCall({ question: 'Why?' }, { progressToken: 'p1' }))

    const progress = sseData(res.text).filter(msg => msg.method === 'notifications/progress')
    expect(progress.map(msg => msg.params)).toEqual([
      { progressToken: 'p1', progress: 1, message: 'Consulting search_code...' },
      { progressToken: 'p1', progress: 2, message: 'search_code completed' },
    ])
  })

  it('emits no progress when the client sent no progress token', async () => {
    executeAskSoporti.mockImplementation(async ({ onProgress }) => {
      await onProgress('Consulting search_code...')
      return 'Done.'
    })

    const res = await postCall(makeApp(), legacyCall({ question: 'Why?' }))

    expect(sseData(res.text).filter(msg => msg.method === 'notifications/progress')).toEqual([])
    expect(sseData(res.text).find(msg => msg.id === 1).result.content[0].text).toBe('Done.')
  })

  it('scopes the sources to the API key when none are requested', async () => {
    const app = makeApp({ apiKey: { id: 1, sources: ['integration:notion'] } })

    await postCall(app, legacyCall({ question: 'Why?' }))

    expect(executeAskSoporti).toHaveBeenCalledWith(expect.objectContaining({ sources: ['integration:notion'] }))
  })

  it('refuses sources outside the API key scope', async () => {
    const app = makeApp({ apiKey: { id: 1, sources: ['integration:notion'] } })

    const res = await postCall(app, legacyCall({ question: 'Why?', sources: ['integration:sentry', 'yolo'] }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Sources not allowed for this API key: integration:sentry, yolo.')
    expect(executeAskSoporti).not.toHaveBeenCalled()
  })

  it('returns a tool error when the assistant is not configured', async () => {
    isConfigured.mockResolvedValue(false)

    const res = await postCall(makeApp(), legacyCall({ question: 'Why?' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not configured')
    expect(executeAskSoporti).not.toHaveBeenCalled()
  })

  it('returns a tool error for a blank question', async () => {
    const res = await postCall(makeApp(), legacyCall({ question: '   ' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Question cannot be empty.')
    expect(executeAskSoporti).not.toHaveBeenCalled()
  })

  it('hides internal errors behind a generic tool error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    executeAskSoporti.mockRejectedValue(new Error('pg: connection refused at 10.0.0.3'))

    const res = await postCall(makeApp(), legacyCall({ question: 'Why?' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('An internal error occurred while answering the question.')
    expect(res.text).not.toContain('10.0.0.3')
  })

  it('answers a retried request with a fresh id after the stream was cut mid-run', async () => {
    const app = makeApp()
    const server = await listenOn(app)

    try {
      let sawProgress
      const progressSeen = new Promise(resolve => {
        sawProgress = resolve
      })
      let release
      executeAskSoporti.mockImplementationOnce(async ({ onProgress, signal }) => {
        await onProgress('Consulting search_code...')
        sawProgress(signal)
        await new Promise(resolve => {
          release = resolve
        })
        return 'Never delivered.'
      })

      const abort = new AbortController()
      const cutRequest = fetchCall(
        server.address().port,
        legacyCall({ question: 'Why?' }, { progressToken: 'p1' }),
        abort.signal
      ).catch(() => null)

      const runSignal = await progressSeen
      abort.abort()
      await cutRequest
      await vi.waitFor(() => expect(runSignal.aborted).toBe(true))
      release()

      const res = await postCall(app, legacyCall({ question: 'Why?' }, {}, 2))

      const result = sseData(res.text).find(msg => msg.id === 2).result
      expect(result.content).toEqual([{ type: 'text', text: 'The answer.' }])
      expect(result.isError).toBeUndefined()
    } finally {
      await closeServer(server)
    }
  })

  it('keeps emitting heartbeat progress while the agent stays silent', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const app = makeApp()
    const server = await listenOn(app)

    try {
      let finish
      executeAskSoporti.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve
          })
      )

      const pending = fetchCall(server.address().port, legacyCall({ question: 'Why?' }, { progressToken: 'p1' }))

      await vi.waitFor(() => expect(executeAskSoporti).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(15_000)
      finish('Done.')

      const res = await pending
      const text = await res.text()
      const progress = sseData(text).filter(msg => msg.method === 'notifications/progress')
      expect(progress.map(msg => msg.params.message)).toContain('Still working...')
      expect(sseData(text).find(msg => msg.id === 1).result.content[0].text).toBe('Done.')
    } finally {
      vi.useRealTimers()
      await closeServer(server)
    }
  })

  it('rejects invalid tool arguments without running the agent', async () => {
    const res = await postCall(makeApp(), legacyCall({ question: 'Why?', profile: 'ceo' }))

    const message = sseData(res.text).find(msg => msg.id === 1)
    expect(JSON.stringify(message)).toContain('profile')
    expect(executeAskSoporti).not.toHaveBeenCalled()
  })
})
