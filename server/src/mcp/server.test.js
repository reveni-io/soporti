import { createServer } from 'node:http'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../llm/model.js', () => ({ isConfigured: vi.fn(async () => true) }))
vi.mock('./ask-soporti.js', async importOriginal => {
  const original = await importOriginal()
  return { ...original, executeAskSoporti: vi.fn() }
})
vi.mock('./list-sources.js', () => ({ executeListSources: vi.fn() }))
vi.mock('../db/skills.js', () => ({ listSkills: vi.fn() }))

const { isConfigured } = await import('../llm/model.js')
const { executeAskSoporti } = await import('./ask-soporti.js')
const { executeListSources } = await import('./list-sources.js')
const { listSkills } = await import('../db/skills.js')
const { default: mcpRoute } = await import('./route.js')

const USER = { id: 7, email: 'jose@reveni.io', name: 'Jose', role: 'user' }
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111'
const SESSION = { id: 'session' }
const FOLLOW_UP_HINT = `\n\n_Continue this thread by calling \`follow_up\` with conversationId "${CONVERSATION_ID}"._`
const ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
}

let conversationStore

function makeStore() {
  return {
    resolveWeb: vi.fn(async () => ({
      conversationId: CONVERSATION_ID,
      session: SESSION,
      previousResponseId: undefined,
      isNewConversation: true,
    })),
    resolveExistingWeb: vi.fn(async () => null),
    getInvokedSkillIds: vi.fn(async () => []),
    saveTurn: vi.fn(),
  }
}

function existingThread(previousResponseId = 'resp-0') {
  return {
    conversationId: CONVERSATION_ID,
    session: SESSION,
    previousResponseId,
    isNewConversation: false,
  }
}

function makeApp({ user = USER, apiKey, store = conversationStore } = {}) {
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use((req, _res, next) => {
    req.user = user
    req.apiKey = apiKey
    next()
  })
  app.use('/api/mcp', mcpRoute(store))
  return app
}

function toolCall(name, args, meta = {}, id = 1) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args, _meta: meta } }
}

function legacyCall(args, meta = {}, id = 1) {
  return toolCall('ask_soporti', args, meta, id)
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
  executeAskSoporti.mockResolvedValue({
    answer: 'The answer.',
    lastResponseId: 'resp-1',
    unpersistedItems: null,
    skills: [],
  })
  executeListSources.mockResolvedValue({ repos: [], integrations: [] })
  listSkills.mockResolvedValue([])
  conversationStore = makeStore()
})

describe('mcp server', () => {
  it('answers a legacy tools/call with the agent answer', async () => {
    const res = await postCall(makeApp(), legacyCall({ question: 'What failed?' }))

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.headers['x-accel-buffering']).toBe('no')

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.content).toEqual([{ type: 'text', text: `The answer.${FOLLOW_UP_HINT}` }])
    expect(result.isError).toBeUndefined()
    expect(executeAskSoporti).toHaveBeenCalledWith({
      question: 'What failed?',
      sources: [],
      profile: undefined,
      skillIds: [],
      userId: 7,
      conversation: {
        conversationId: CONVERSATION_ID,
        session: SESSION,
        previousResponseId: undefined,
        isNewConversation: true,
      },
      onProgress: expect.any(Function),
      signal: expect.any(AbortSignal),
    })
  })

  it('opens a fresh thread for every question', async () => {
    await postCall(makeApp(), legacyCall({ question: 'What failed?' }))

    expect(conversationStore.resolveWeb).toHaveBeenCalledWith(null, 7)
  })

  it('saves the turn on the thread, so the web app can show it and follow_up can continue it', async () => {
    executeAskSoporti.mockResolvedValue({
      answer: 'Two payments failed.',
      lastResponseId: 'resp-9',
      unpersistedItems: [{ type: 'message' }],
      skills: [],
    })

    await postCall(makeApp(), legacyCall({ question: 'What failed?' }))

    expect(conversationStore.saveTurn).toHaveBeenCalledTimes(1)
    expect(conversationStore.saveTurn).toHaveBeenCalledWith(CONVERSATION_ID, {
      lastResponseId: 'resp-9',
      session: SESSION,
      unpersistedItems: [{ type: 'message' }],
      uiMessages: [
        { role: 'user', parts: [{ type: 'text', content: 'What failed?' }] },
        { role: 'assistant', parts: [{ type: 'text', content: 'Two payments failed.' }] },
      ],
    })
  })

  it('records the applied skills on the thread, so a follow-up can carry them over', async () => {
    executeAskSoporti.mockResolvedValue({
      answer: 'Done.',
      lastResponseId: 'resp-9',
      unpersistedItems: null,
      skills: [{ id: 3, name: 'triage' }],
    })

    await postCall(makeApp(), legacyCall({ question: 'What failed?', skillIds: [3] }))

    expect(conversationStore.saveTurn).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({
        uiMessages: [
          {
            role: 'user',
            parts: [
              { type: 'skill', skillId: 3, name: 'triage' },
              { type: 'text', content: 'What failed?' },
            ],
          },
          { role: 'assistant', parts: [{ type: 'text', content: 'Done.' }] },
        ],
      })
    )
  })

  it('answers with a generic tool error when the turn cannot be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    conversationStore.saveTurn.mockRejectedValue(new Error('pg: connection refused at 10.0.0.3'))

    const res = await postCall(makeApp(), legacyCall({ question: 'What failed?' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('An internal error occurred while answering the question.')
    expect(res.text).not.toContain('10.0.0.3')
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
    expect(result.content).toEqual([{ type: 'text', text: `The answer.${FOLLOW_UP_HINT}` }])
    expect(result.resultType).toBe('complete')
    expect(executeAskSoporti).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'What failed?',
        sources: ['integration:sentry'],
        profile: 'tech',
        skillIds: [3],
        userId: 7,
      })
    )
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

  it('lists every tool as read-only with its required arguments', async () => {
    const res = await postCall(makeApp(), { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })

    const { tools } = sseData(res.text).find(msg => msg.id === 2).result
    expect(tools.map(tool => tool.name)).toEqual(['ask_soporti', 'follow_up', 'list_sources', 'list_skills'])
    expect(tools.every(tool => tool.annotations.readOnlyHint)).toBe(true)

    const requiredByName = Object.fromEntries(tools.map(tool => [tool.name, tool.inputSchema.required]))
    expect(requiredByName.ask_soporti).toEqual(['question'])
    expect(requiredByName.follow_up).toEqual(['conversationId', 'message'])
    expect(requiredByName.list_sources).toBeUndefined()
    expect(requiredByName.list_skills).toBeUndefined()
  })

  it('declares the output shape of the listing tools', async () => {
    const res = await postCall(makeApp(), { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })

    const { tools } = sseData(res.text).find(msg => msg.id === 2).result
    const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
    expect(Object.keys(byName.list_sources.outputSchema.properties)).toEqual(['repos', 'integrations'])
    expect(Object.keys(byName.list_skills.outputSchema.properties)).toEqual(['skills'])
  })

  it('relays tool progress as notifications/progress on the stream', async () => {
    executeAskSoporti.mockImplementation(async ({ onProgress }) => {
      await onProgress('Consulting search_code...')
      await onProgress('search_code completed')
      return { answer: 'Done.', lastResponseId: 'resp-1', unpersistedItems: null, skills: [] }
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
      return { answer: 'Done.', lastResponseId: 'resp-1', unpersistedItems: null, skills: [] }
    })

    const res = await postCall(makeApp(), legacyCall({ question: 'Why?' }))

    expect(sseData(res.text).filter(msg => msg.method === 'notifications/progress')).toEqual([])
    expect(sseData(res.text).find(msg => msg.id === 1).result.content[0].text).toBe(`Done.${FOLLOW_UP_HINT}`)
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
        return { answer: 'Never delivered.', lastResponseId: 'resp-1', unpersistedItems: null, skills: [] }
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
      expect(result.content).toEqual([{ type: 'text', text: `The answer.${FOLLOW_UP_HINT}` }])
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
      finish({ answer: 'Done.', lastResponseId: 'resp-1', unpersistedItems: null, skills: [] })

      const res = await pending
      const text = await res.text()
      const progress = sseData(text).filter(msg => msg.method === 'notifications/progress')
      expect(progress.map(msg => msg.params.message)).toContain('Still working...')
      expect(sseData(text).find(msg => msg.id === 1).result.content[0].text).toBe(`Done.${FOLLOW_UP_HINT}`)
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

describe('follow_up', () => {
  it('continues the thread named in the arguments', async () => {
    conversationStore.resolveExistingWeb.mockResolvedValue(existingThread())

    const res = await postCall(makeApp(), toolCall('follow_up', { conversationId: CONVERSATION_ID, message: 'And?' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.content).toEqual([{ type: 'text', text: `The answer.${FOLLOW_UP_HINT}` }])
    expect(conversationStore.resolveExistingWeb).toHaveBeenCalledWith(CONVERSATION_ID, 7)
    expect(executeAskSoporti).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'And?',
        userId: 7,
        conversation: expect.objectContaining({ conversationId: CONVERSATION_ID, previousResponseId: 'resp-0' }),
      })
    )
  })

  it('reports a conversation that does not exist as not found, creating nothing', async () => {
    const res = await postCall(makeApp(), toolCall('follow_up', { conversationId: CONVERSATION_ID, message: 'And?' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Conversation not found.')
    expect(executeAskSoporti).not.toHaveBeenCalled()
    expect(conversationStore.resolveWeb).not.toHaveBeenCalled()
    expect(conversationStore.saveTurn).not.toHaveBeenCalled()
  })

  it('answers the same for a repeated follow_up on an id that does not exist', async () => {
    const app = makeApp()
    const first = await postCall(app, toolCall('follow_up', { conversationId: CONVERSATION_ID, message: 'And?' }))
    const second = await postCall(app, toolCall('follow_up', { conversationId: CONVERSATION_ID, message: 'And?' }))

    expect(sseData(second.text).find(msg => msg.id === 1).result).toEqual(
      sseData(first.text).find(msg => msg.id === 1).result
    )
  })

  it('reports another user conversation exactly like one that does not exist', async () => {
    conversationStore.resolveExistingWeb.mockResolvedValue(null)

    const res = await postCall(makeApp(), toolCall('follow_up', { conversationId: CONVERSATION_ID, message: 'And?' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Conversation not found.')
    expect(executeAskSoporti).not.toHaveBeenCalled()
  })

  it('carries the skills of the thread into the follow-up', async () => {
    conversationStore.resolveExistingWeb.mockResolvedValue(existingThread())
    conversationStore.getInvokedSkillIds.mockResolvedValue([3, 4])

    await postCall(makeApp(), toolCall('follow_up', { conversationId: CONVERSATION_ID, message: 'And?' }))

    expect(conversationStore.getInvokedSkillIds).toHaveBeenCalledWith(CONVERSATION_ID)
    expect(executeAskSoporti).toHaveBeenCalledWith(expect.objectContaining({ skillIds: [3, 4] }))
  })

  it('investigates within the scope of the API key', async () => {
    conversationStore.resolveExistingWeb.mockResolvedValue(existingThread(undefined))
    const app = makeApp({ apiKey: { id: 1, sources: ['integration:notion'] } })

    await postCall(app, toolCall('follow_up', { conversationId: CONVERSATION_ID, message: 'And?' }))

    expect(executeAskSoporti).toHaveBeenCalledWith(
      expect.objectContaining({ sources: ['integration:notion'], skillIds: [] })
    )
  })

  it('rejects a conversationId that is not a UUID without touching the store', async () => {
    const res = await postCall(makeApp(), toolCall('follow_up', { conversationId: 'not-a-uuid', message: 'And?' }))

    expect(JSON.stringify(sseData(res.text).find(msg => msg.id === 1))).toContain('conversationId')
    expect(conversationStore.resolveExistingWeb).not.toHaveBeenCalled()
  })

  it('returns a tool error for a blank message', async () => {
    const res = await postCall(makeApp(), toolCall('follow_up', { conversationId: CONVERSATION_ID, message: '   ' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Message cannot be empty.')
    expect(conversationStore.resolveExistingWeb).not.toHaveBeenCalled()
  })

  it('returns a tool error when the assistant is not configured', async () => {
    isConfigured.mockResolvedValue(false)

    const res = await postCall(makeApp(), toolCall('follow_up', { conversationId: CONVERSATION_ID, message: 'And?' }))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not configured')
    expect(conversationStore.resolveExistingWeb).not.toHaveBeenCalled()
  })
})

describe('list_sources', () => {
  it('returns the repos and integrations as structured content', async () => {
    executeListSources.mockResolvedValue({
      repos: [{ source: 'reveni-io/soporti', description: 'The assistant', language: 'JavaScript' }],
      integrations: [{ source: 'integration:notion', name: 'Notion', description: 'Search and read Notion pages' }],
    })

    const res = await postCall(makeApp(), toolCall('list_sources', {}))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.structuredContent.repos).toEqual([
      { source: 'reveni-io/soporti', description: 'The assistant', language: 'JavaScript' },
    ])
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
    expect(executeListSources).toHaveBeenCalledWith({ userId: 7, scope: undefined })
  })

  it('lists within the scope of the API key', async () => {
    const app = makeApp({ apiKey: { id: 1, sources: ['integration:notion'] } })

    await postCall(app, toolCall('list_sources', {}))

    expect(executeListSources).toHaveBeenCalledWith({ userId: 7, scope: ['integration:notion'] })
  })

  it('hides internal errors behind a generic tool error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    executeListSources.mockRejectedValue(new Error('github: bad credentials for token ghp_secret'))

    const res = await postCall(makeApp(), toolCall('list_sources', {}))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('An internal error occurred while listing the sources.')
    expect(res.text).not.toContain('ghp_secret')
  })
})

describe('list_skills', () => {
  it('returns the skills of the requesting user without their instructions', async () => {
    listSkills.mockResolvedValue([
      { id: 3, name: 'triage', description: 'Triage a bug report', instructions: 'Secret sauce.' },
      { id: 4, name: 'release-notes', description: null, instructions: 'More sauce.' },
    ])

    const res = await postCall(makeApp(), toolCall('list_skills', {}))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.structuredContent).toEqual({
      skills: [
        { id: 3, name: 'triage', description: 'Triage a bug report' },
        { id: 4, name: 'release-notes', description: '' },
      ],
    })
    expect(res.text).not.toContain('sauce')
    expect(listSkills).toHaveBeenCalledWith(7)
  })

  it('hides internal errors behind a generic tool error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    listSkills.mockRejectedValue(new Error('pg: connection refused at 10.0.0.3'))

    const res = await postCall(makeApp(), toolCall('list_skills', {}))

    const result = sseData(res.text).find(msg => msg.id === 1).result
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('An internal error occurred while listing the skills.')
    expect(res.text).not.toContain('10.0.0.3')
  })
})
