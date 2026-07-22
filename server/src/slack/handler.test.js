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

import { run } from '@openai/agents'
import { processMessage } from './handler.js'

function createStreamMock(events) {
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
})
