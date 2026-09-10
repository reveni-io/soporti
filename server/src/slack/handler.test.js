import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({
  run: vi.fn(),
}))

vi.mock('../agent/assistant.js', () => ({
  createAgent: vi.fn(() => ({ name: 'test-agent' })),
}))

vi.mock('../config.js', () => ({
  default: {
    agent: { maxIterations: 5 },
    openai: { apiKey: 'test', model: 'gpt-4o' },
    github: { token: 'test' },
  },
}))

vi.mock('../knowledge/client.js', () => ({
  searchSimilarCases: vi.fn(async () => []),
}))

vi.mock('../db/users.js', () => ({
  upsertSlackUser: vi.fn(async ({ slackId }) => ({ id: 1, slackId, name: null })),
  getCustomInstructions: vi.fn(async () => null),
}))

vi.mock('../db/agent-runs.js', () => ({
  recordAgentRun: vi.fn(),
}))

import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { searchSimilarCases } from '../knowledge/client.js'
import { recordAgentRun } from '../db/agent-runs.js'
import { processMessage } from './handler.js'

function createStreamMock(events, { history, lastResponseId, usage } = {}) {
  return {
    state: usage ? { usage } : undefined,
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

describe('processMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns collected text from stream', async () => {
    run.mockResolvedValue(
      createStreamMock([
        { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hello ' } },
        { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'world' } },
      ])
    )

    const result = await processMessage({
      message: 'hi',
      selectedSources: ['org/repo'],
      session: {},
      profile: 'support',
    })

    expect(result.text).toBe('Hello world')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.toolCalls).toEqual([])
  })

  it('returns the turn items when the provider kept the context server-side', async () => {
    const turnHistory = [
      { type: 'message', role: 'user', content: 'hi' },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello' }] },
    ]
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hello' } }], {
        history: turnHistory,
      })
    )

    const result = await processMessage({
      message: 'hi',
      selectedSources: [],
      session: {},
      previousResponseId: 'resp_previous',
      profile: 'support',
    })

    expect(result.unpersistedItems).toEqual(turnHistory)
  })

  it('leaves the turn items to the sdk when no context token was sent', async () => {
    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hello' } }], {
        history: [{ type: 'message', role: 'user', content: 'hi' }],
      })
    )

    const result = await processMessage({
      message: 'hi',
      selectedSources: [],
      session: {},
      profile: 'support',
    })

    expect(result.unpersistedItems).toBeNull()
  })

  it('tracks tool calls', async () => {
    run.mockResolvedValue(
      createStreamMock([
        {
          type: 'run_item_stream_event',
          item: { type: 'tool_call_item', rawItem: { name: 'search_code' } },
        },
        {
          type: 'run_item_stream_event',
          item: { type: 'tool_call_item', rawItem: { name: 'get_file_contents' } },
        },
        { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Found it' } },
      ])
    )

    const result = await processMessage({
      message: 'find auth',
      selectedSources: [],
      session: {},
      profile: 'tech',
    })

    expect(result.toolCalls.map(c => c.name)).toEqual(['search_code', 'get_file_contents'])
    expect(result.text).toBe('Found it')
  })

  it('handles empty response', async () => {
    run.mockResolvedValue(createStreamMock([]))

    const result = await processMessage({
      message: 'test',
      selectedSources: [],
      session: {},
      profile: 'support',
    })

    expect(result.text).toBe('')
    expect(result.toolCalls).toEqual([])
  })

  it('records the run with its usage and the tools it called', async () => {
    run.mockResolvedValue(
      createStreamMock(
        [
          { type: 'run_item_stream_event', item: { type: 'tool_call_item', rawItem: { name: 'search_code' } } },
          { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Found it' } },
        ],
        { usage: { requests: 2, inputTokens: 800, outputTokens: 60, inputTokensDetails: [{ cached_tokens: 400 }] } }
      )
    )

    await processMessage({ message: 'find auth', selectedSources: [], session: {}, profile: 'tech' })

    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'slack',
      status: 'ok',
      userId: null,
      usage: { requests: 2, inputTokens: 800, outputTokens: 60, cachedInputTokens: 400, cacheWriteTokens: 0 },
      durationMs: expect.any(Number),
      tools: ['search_code'],
    })
  })

  it('leaves the tool calls it could not name out of the recorded run', async () => {
    run.mockResolvedValue(
      createStreamMock([
        { type: 'run_item_stream_event', item: { type: 'tool_call_item', rawItem: {} } },
        { type: 'run_item_stream_event', item: { type: 'tool_call_item', rawItem: { name: 'search_code' } } },
      ])
    )

    await processMessage({ message: 'find auth', selectedSources: [], session: {}, profile: 'tech' })

    expect(recordAgentRun).toHaveBeenCalledWith(expect.objectContaining({ tools: ['search_code'] }))
  })

  it('records a failed run and rethrows when the agent fails', async () => {
    run.mockRejectedValue(new Error('model unavailable'))

    await expect(
      processMessage({ message: 'hi', selectedSources: [], session: {}, profile: 'support' })
    ).rejects.toThrow('model unavailable')

    expect(recordAgentRun).toHaveBeenCalledWith({ channel: 'slack', status: 'error', userId: null })
  })

  it('attributes the run to the Slack user behind the message', async () => {
    run.mockResolvedValue(createStreamMock([]))

    await processMessage({
      message: 'hi',
      selectedSources: [],
      session: {},
      profile: 'support',
      slackUserId: 'U123',
    })

    expect(recordAgentRun).toHaveBeenCalledWith(expect.objectContaining({ channel: 'slack', userId: 1 }))
  })

  it('searches similar cases on the message that opens the thread and sends them in the user turn', async () => {
    searchSimilarCases.mockResolvedValueOnce([{ question: 'Why 500?', answer: 'Bad token', score: 0.9 }])
    run.mockResolvedValue(createStreamMock([]))

    await processMessage({
      message: 'why 500?',
      selectedSources: [],
      session: {},
      profile: 'tech',
      isNewConversation: true,
    })

    expect(searchSimilarCases).toHaveBeenCalledTimes(1)
    expect(searchSimilarCases).toHaveBeenCalledWith('why 500?')
    expect(run.mock.calls[0][1]).toContain('Bad token')
    expect(run.mock.calls[0][1].endsWith('why 500?')).toBe(true)
    expect(createAgent).toHaveBeenCalledWith([], 'tech', {
      customInstructions: '',
      userId: null,
      onNestedToolCall: expect.any(Function),
      onNestedUsage: expect.any(Function),
    })
  })

  it('skips the similar cases search on a reply to an existing thread', async () => {
    run.mockResolvedValue(createStreamMock([]))

    await processMessage({
      message: 'and the retries?',
      selectedSources: [],
      session: {},
      profile: 'tech',
      isNewConversation: false,
    })

    expect(searchSimilarCases).not.toHaveBeenCalled()
    expect(run.mock.calls[0][1]).toBe('and the retries?')
  })

  it('sends the same input on both attempts when the first turn is retried', async () => {
    searchSimilarCases.mockResolvedValueOnce([{ question: 'Why 500?', answer: 'Bad token', score: 0.9 }])
    run
      .mockRejectedValueOnce(new Error('previous response not found'))
      .mockResolvedValueOnce(
        createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hello' } }])
      )

    await processMessage({
      message: 'why 500?',
      selectedSources: [],
      session: {},
      previousResponseId: 'resp_previous',
      profile: 'tech',
      isNewConversation: true,
    })

    expect(run.mock.calls[1][1]).toBe(run.mock.calls[0][1])
    expect(run.mock.calls[1][1]).toContain('Bad token')
  })

  it('retries without the context token when the first turn fails before sending text', async () => {
    run
      .mockRejectedValueOnce(new Error('previous response not found'))
      .mockResolvedValueOnce(
        createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hello' } }])
      )

    const result = await processMessage({
      message: 'hi',
      selectedSources: [],
      session: {},
      previousResponseId: 'resp_previous',
      profile: 'support',
    })

    expect(result.text).toBe('Hello')
    expect(run.mock.calls[1][2].previousResponseId).toBeUndefined()
    expect(recordAgentRun).toHaveBeenCalledWith(expect.objectContaining({ channel: 'slack', status: 'ok' }))
  })

  it('reports text deltas and tool progress to onProgress in order', async () => {
    run.mockResolvedValue(
      createStreamMock([
        {
          type: 'run_item_stream_event',
          item: {
            type: 'tool_call_item',
            rawItem: { name: 'search_code', arguments: '{"query":"login"}', callId: 'c1' },
          },
        },
        { type: 'run_item_stream_event', item: { type: 'tool_call_output_item', rawItem: { callId: 'c1' } } },
        { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Done' } },
      ])
    )

    const events = []

    await processMessage({
      message: 'hi',
      selectedSources: [],
      session: {},
      profile: 'support',
      onProgress: event => events.push(event),
    })

    expect(events).toEqual([
      { type: 'tool_start', taskId: 'task-0', name: 'search_code', arguments: '{"query":"login"}' },
      { type: 'tool_end', taskId: 'task-0' },
      { type: 'text_delta', delta: 'Done' },
    ])
  })

  it('reuses task ids across a retry so repeated steps update in place', async () => {
    const toolEvents = [
      {
        type: 'run_item_stream_event',
        item: { type: 'tool_call_item', rawItem: { name: 'list_repos', arguments: '{}', callId: 'c1' } },
      },
    ]

    run
      .mockRejectedValueOnce(new Error('previous response not found'))
      .mockResolvedValueOnce(
        createStreamMock([
          ...toolEvents,
          { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hi' } },
        ])
      )

    const events = []

    await processMessage({
      message: 'hi',
      selectedSources: [],
      session: {},
      previousResponseId: 'resp_previous',
      profile: 'support',
      onProgress: event => events.push(event),
    })

    expect(events.filter(e => e.type === 'tool_start').map(e => e.taskId)).toEqual(['task-0'])
  })

  it('keeps running when onProgress throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    run.mockResolvedValue(
      createStreamMock([{ type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Hello' } }])
    )

    const result = await processMessage({
      message: 'hi',
      selectedSources: [],
      session: {},
      profile: 'support',
      onProgress: () => {
        throw new Error('slack down')
      },
    })

    expect(result.text).toBe('Hello')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('returns the sources footer separately so it can close the stream', async () => {
    run.mockResolvedValue(
      createStreamMock([
        {
          type: 'run_item_stream_event',
          item: {
            type: 'tool_call_item',
            rawItem: { name: 'get_file_contents', arguments: '{"repo":"org/repo","path":"a.js"}', callId: 'c1' },
          },
        },
        { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta: 'Answer' } },
      ])
    )

    const result = await processMessage({
      message: 'hi',
      selectedSources: ['yolo'],
      session: {},
      profile: 'support',
    })

    expect(result.footer).not.toBe('')
    expect(result.text).toBe(`Answer${result.footer}`)
  })
})
