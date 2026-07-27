import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const assistantMocks = vi.hoisted(() => ({
  createAgent: vi.fn(() => ({ name: 'test-agent' })),
}))

vi.mock('@openai/agents', () => ({
  run: vi.fn(),
}))

vi.mock('../agent/assistant.js', () => ({
  createAgent: assistantMocks.createAgent,
}))

vi.mock('../config.js', () => ({
  default: {
    agent: { maxIterations: 5 },
    openai: { apiKey: 'test', model: 'gpt-4o' },
    github: { token: 'test' },
    auth: { username: 'test', password: 'test' },
  },
}))

vi.mock('../knowledge/client.js', () => ({
  searchSimilarCases: vi.fn(async () => []),
  isKnowledgeBaseConfigured: vi.fn(async () => true),
}))

vi.mock('../knowledge/feedback.js', () => ({
  storePendingFeedback: vi.fn(() => 'test-feedback-id'),
}))

vi.mock('../db/users.js', () => ({
  getCustomInstructions: vi.fn(async () => null),
}))

vi.mock('../db/skills.js', () => ({
  getSkillsByIds: vi.fn(async () => []),
}))

vi.mock('../llm/model.js', () => ({
  isConfigured: vi.fn(async () => true),
}))

import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { isKnowledgeBaseConfigured } from '../knowledge/client.js'
import { isConfigured } from '../llm/model.js'
import { getSkillsByIds } from '../db/skills.js'
import chatRoute from './chat.js'

function createStreamMock(events, { history, lastResponseId } = {}) {
  return {
    toStream: () => ({
      [Symbol.asyncIterator]() {
        let i = 0
        return {
          async next() {
            if (i >= events.length) return { done: true }
            return { done: false, value: events[i++] }
          },
        }
      },
    }),
    completed: Promise.resolve(),
    history,
    lastResponseId,
  }
}

const TEST_CONVERSATION_ID = '11111111-1111-4111-8111-111111111111'

function buildSession() {
  return { getItems: vi.fn(async () => []) }
}

const conversationStore = {
  resolveWeb: vi.fn(async () => ({
    conversationId: TEST_CONVERSATION_ID,
    session: buildSession(),
    previousResponseId: undefined,
  })),
  saveTurn: vi.fn(async () => {}),
  getInvokedSkillIds: vi.fn(async () => []),
}
const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { id: 1, email: 'test@test.com', name: 'Test' }
  next()
})
app.use('/', chatRoute(conversationStore))

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationStore.resolveWeb.mockResolvedValue({
      conversationId: TEST_CONVERSATION_ID,
      session: buildSession(),
      previousResponseId: undefined,
    })
    conversationStore.saveTurn.mockResolvedValue(undefined)
    conversationStore.getInvokedSkillIds.mockResolvedValue([])
  })

  it('returns 400 for missing message', async () => {
    const res = await request(app).post('/').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty message', async () => {
    const res = await request(app).post('/').send({ message: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for too-long message', async () => {
    const res = await request(app)
      .post('/')
      .send({ message: 'a'.repeat(10001) })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid session ID format', async () => {
    const res = await request(app).post('/').send({ message: 'hello', sessionId: 'not-a-uuid' })
    expect(res.status).toBe(400)
  })

  it('returns 503 when the llm provider is not configured (no session is built)', async () => {
    isConfigured.mockResolvedValueOnce(false)

    const res = await request(app).post('/').send({ message: 'hello' })

    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/not configured/i)
    expect(conversationStore.resolveWeb).not.toHaveBeenCalled()
  })

  it('streams SSE events for valid request', async () => {
    run.mockResolvedValue(
      createStreamMock([
        { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hello' } },
        { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: ' world' } },
      ])
    )

    const res = await request(app)
      .post('/')
      .send({ message: 'test', selectedSources: ['org/repo'] })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')

    const events = res.text
      .split('\n\n')
      .filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.replace('data: ', '')))

    expect(events.some(e => e.type === 'session_id')).toBe(true)
    expect(events.some(e => e.type === 'text_delta' && e.text === 'Hello')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  function streamEvents(res) {
    return res.text
      .split('\n\n')
      .filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.replace('data: ', '')))
  }

  it('emits a feedback_id when the knowledge base is configured', async () => {
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hi' } }])
    )

    const res = await request(app).post('/').send({ message: 'test' })

    expect(streamEvents(res).some(e => e.type === 'feedback_id')).toBe(true)
  })

  it('omits the feedback_id when the knowledge base is not configured', async () => {
    isKnowledgeBaseConfigured.mockResolvedValueOnce(false)
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hi' } }])
    )

    const res = await request(app).post('/').send({ message: 'test' })

    expect(streamEvents(res).some(e => e.type === 'feedback_id')).toBe(false)
  })

  it('resolves a web conversation for the request user', async () => {
    run.mockResolvedValue(createStreamMock([]))

    await request(app).post('/').send({ message: 'hi' })

    expect(conversationStore.resolveWeb).toHaveBeenCalledWith(undefined, 1)
  })

  it('persists the turn after streaming completes', async () => {
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hi there' } }])
    )

    await request(app).post('/').send({ message: 'hello' })

    expect(conversationStore.saveTurn).toHaveBeenCalledWith(
      TEST_CONVERSATION_ID,
      expect.objectContaining({
        uiMessages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
          expect.objectContaining({ role: 'assistant' }),
        ]),
      })
    )
  })

  it('hands the turn items to the store when the provider kept the context server-side', async () => {
    const session = buildSession()
    conversationStore.resolveWeb.mockResolvedValue({
      conversationId: TEST_CONVERSATION_ID,
      session,
      previousResponseId: 'resp_previous',
    })
    const turnHistory = [
      { type: 'message', role: 'user', content: 'hello' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hi there' }] },
    ]
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hi there' } }], {
        history: turnHistory,
      })
    )

    await request(app).post('/').send({ message: 'hello' })

    expect(conversationStore.saveTurn).toHaveBeenCalledWith(
      TEST_CONVERSATION_ID,
      expect.objectContaining({ session, unpersistedItems: turnHistory })
    )
  })

  it('leaves the turn items to the sdk when no context token was sent', async () => {
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hi' } }], {
        history: [{ type: 'message', role: 'user', content: 'hello' }],
      })
    )

    await request(app).post('/').send({ message: 'hello' })

    expect(conversationStore.saveTurn).toHaveBeenCalledWith(
      TEST_CONVERSATION_ID,
      expect.objectContaining({ unpersistedItems: null })
    )
  })

  it('retries without previousResponseId when the chained response expired', async () => {
    conversationStore.resolveWeb.mockResolvedValue({
      conversationId: TEST_CONVERSATION_ID,
      session: buildSession(),
      previousResponseId: 'resp_expired',
    })
    run
      .mockRejectedValueOnce(new Error('Previous response not found'))
      .mockResolvedValueOnce(
        createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'recovered' } }])
      )

    const res = await request(app).post('/').send({ message: 'continue' })

    const events = res.text
      .split('\n\n')
      .filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.replace('data: ', '')))

    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[0][2].previousResponseId).toBe('resp_expired')
    expect(run.mock.calls[1][2].previousResponseId).toBeUndefined()
    expect(events.some(e => e.type === 'text_delta' && e.text === 'recovered')).toBe(true)
    expect(events.some(e => e.type === 'error')).toBe(false)
    expect(conversationStore.saveTurn).toHaveBeenCalledWith(
      TEST_CONVERSATION_ID,
      expect.objectContaining({ unpersistedItems: null })
    )
  })

  it('accepts the legacy selectedRepos field from older clients', async () => {
    run.mockResolvedValue(createStreamMock([]))

    await request(app)
      .post('/')
      .send({ message: 'test', selectedRepos: ['org/legacy'] })

    expect(createAgent).toHaveBeenCalledWith(['org/legacy'], undefined, [], {
      customInstructions: '',
      skills: [],
      skillArguments: 'test',
    })
  })

  it('resolves skillIds to the user own skills and passes them to createAgent', async () => {
    run.mockResolvedValue(createStreamMock([]))
    getSkillsByIds.mockResolvedValueOnce([{ id: 5, name: 'bug-triage', instructions: 'Ask for repro steps.' }])

    await request(app)
      .post('/')
      .send({ message: 'hi', skillIds: [5] })

    expect(getSkillsByIds).toHaveBeenCalledWith([5], 1)
    expect(createAgent).toHaveBeenCalledWith([], undefined, [], {
      customInstructions: '',
      skills: [{ id: 5, name: 'bug-triage', instructions: 'Ask for repro steps.' }],
      skillArguments: 'hi',
    })
  })

  it('persists the invoked command with the user message', async () => {
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'ok' } }])
    )
    getSkillsByIds.mockResolvedValueOnce([{ id: 5, name: 'bug-triage', instructions: 'Ask for repro steps.' }])

    await request(app)
      .post('/')
      .send({ message: 'hi', skillIds: [5] })

    expect(conversationStore.saveTurn).toHaveBeenCalledWith(
      TEST_CONVERSATION_ID,
      expect.objectContaining({
        uiMessages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: [
              { type: 'skill', skillId: 5, name: 'bug-triage' },
              { type: 'text', content: 'hi' },
            ],
          }),
        ]),
      })
    )
  })

  it('keeps a skill invoked earlier in the conversation active without re-persisting it', async () => {
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'ok' } }])
    )
    conversationStore.getInvokedSkillIds.mockResolvedValue([5])
    getSkillsByIds.mockResolvedValueOnce([{ id: 5, name: 'grilling', instructions: 'Interview me.' }])

    await request(app).post('/').send({ message: 'my answer' })

    expect(getSkillsByIds).toHaveBeenCalledWith([5], 1)
    expect(createAgent).toHaveBeenCalledWith([], undefined, [], {
      customInstructions: '',
      skills: [{ id: 5, name: 'grilling', instructions: 'Interview me.' }],
      skillArguments: 'my answer',
    })
    expect(conversationStore.saveTurn).toHaveBeenCalledWith(
      TEST_CONVERSATION_ID,
      expect.objectContaining({
        uiMessages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', parts: [{ type: 'text', content: 'my answer' }] }),
        ]),
      })
    )
  })

  it('shows the model the command as typed while keeping it out of the stored text', async () => {
    run.mockResolvedValue(createStreamMock([]))
    getSkillsByIds.mockResolvedValueOnce([{ id: 5, name: 'code-review', instructions: 'Review it.' }])

    await request(app)
      .post('/')
      .send({ message: 'the last commit of returns-frontend', skillIds: [5] })

    expect(run.mock.calls[0][1]).toBe('/code-review the last commit of returns-frontend')
    expect(createAgent.mock.calls[0][3].skillArguments).toBe('the last commit of returns-frontend')
    expect(conversationStore.saveTurn).toHaveBeenCalledWith(
      TEST_CONVERSATION_ID,
      expect.objectContaining({
        uiMessages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: [
              { type: 'skill', skillId: 5, name: 'code-review' },
              { type: 'text', content: 'the last commit of returns-frontend' },
            ],
          }),
        ]),
      })
    )
  })

  it('does not prepend a command for a carried-over skill', async () => {
    run.mockResolvedValue(createStreamMock([]))
    conversationStore.getInvokedSkillIds.mockResolvedValue([5])
    getSkillsByIds.mockResolvedValueOnce([{ id: 5, name: 'grilling', instructions: 'Interview me.' }])

    await request(app).post('/').send({ message: 'my answer' })

    expect(run.mock.calls[0][1]).toBe('my answer')
  })

  it('merges a carried-over skill with one newly invoked in the same message', async () => {
    run.mockResolvedValue(createStreamMock([]))
    conversationStore.getInvokedSkillIds.mockResolvedValue([5])

    await request(app)
      .post('/')
      .send({ message: 'hi', skillIds: [7] })

    expect(getSkillsByIds).toHaveBeenCalledWith([5, 7], 1)
  })

  it('filters out non-positive-integer skillIds before resolving', async () => {
    run.mockResolvedValue(createStreamMock([]))

    await request(app)
      .post('/')
      .send({ message: 'hi', skillIds: ['abc', 3.5, -1, 0, 9] })

    expect(getSkillsByIds).toHaveBeenCalledWith([9], 1)
  })

  it('does not resolve skills when none are invoked nor carried over', async () => {
    run.mockResolvedValue(createStreamMock([]))

    await request(app).post('/').send({ message: 'hi' })

    expect(getSkillsByIds).not.toHaveBeenCalled()
    expect(createAgent).toHaveBeenCalledWith([], undefined, [], {
      customInstructions: '',
      skills: [],
      skillArguments: 'hi',
    })
  })

  it('streams tool_start and tool_end events', async () => {
    run.mockResolvedValue(
      createStreamMock([
        {
          type: 'run_item_stream_event',
          item: {
            type: 'tool_call_item',
            rawItem: { name: 'search_code', arguments: '{"repo":"org/app","query":"auth"}', callId: 'call-1' },
          },
        },
        {
          type: 'run_item_stream_event',
          item: {
            type: 'tool_call_output_item',
            rawItem: { callId: 'call-1' },
          },
        },
      ])
    )

    const res = await request(app).post('/').send({ message: 'search for auth' })

    const events = res.text
      .split('\n\n')
      .filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.replace('data: ', '')))

    expect(events.some(e => e.type === 'tool_start' && e.tool === 'search_code')).toBe(true)
    expect(events.some(e => e.type === 'tool_end' && e.tool === 'search_code')).toBe(true)
  })

  it('sends error event when agent throws', async () => {
    run.mockRejectedValue(new Error('Agent crashed'))

    const res = await request(app).post('/').send({ message: 'hi' })

    const events = res.text
      .split('\n\n')
      .filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.replace('data: ', '')))

    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })
})
