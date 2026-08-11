import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({ run: vi.fn() }))
vi.mock('../agent/assistant.js', () => ({ createAgent: vi.fn() }))
vi.mock('../knowledge/client.js', () => ({ searchSimilarCases: vi.fn() }))
vi.mock('../db/users.js', () => ({ getCustomInstructions: vi.fn() }))
vi.mock('../db/skills.js', () => ({ getSkillsByIds: vi.fn() }))
vi.mock('../db/agent-runs.js', () => ({ recordAgentRun: vi.fn() }))

const { run } = await import('@openai/agents')
const { createAgent } = await import('../agent/assistant.js')
const { searchSimilarCases } = await import('../knowledge/client.js')
const { getCustomInstructions } = await import('../db/users.js')
const { getSkillsByIds } = await import('../db/skills.js')
const { recordAgentRun } = await import('../db/agent-runs.js')
const { executeAskSoporti, resolveScopedSources } = await import('./ask-soporti.js')

function makeStream(events, extra = {}) {
  return {
    toStream: () => ({
      async *[Symbol.asyncIterator]() {
        yield* events
      },
    }),
    completed: Promise.resolve(),
    state: { usage: undefined },
    newItems: [],
    ...extra,
  }
}

function textDelta(delta) {
  return { type: 'raw_model_stream_event', data: { type: 'output_text_delta', delta } }
}

function toolCall(name, args = '{}', callId = 'call-1') {
  return { type: 'run_item_stream_event', item: { type: 'tool_call_item', rawItem: { name, arguments: args, callId } } }
}

function toolOutput(callId = 'call-1') {
  return { type: 'run_item_stream_event', item: { type: 'tool_call_output_item', rawItem: { callId } } }
}

beforeEach(() => {
  vi.clearAllMocks()
  createAgent.mockResolvedValue({ name: 'agent' })
  searchSimilarCases.mockResolvedValue([])
  getCustomInstructions.mockResolvedValue('Be brief.')
  getSkillsByIds.mockResolvedValue([])
  run.mockResolvedValue(makeStream([textDelta('The answer.')]))
})

describe('resolveScopedSources', () => {
  it('passes the requested sources through when the key has no scope', () => {
    expect(resolveScopedSources(['reveni-io/soporti'], [])).toEqual({ sources: ['reveni-io/soporti'] })
    expect(resolveScopedSources(['yolo'], undefined)).toEqual({ sources: ['yolo'] })
  })

  it('falls back to the scope when no sources are requested', () => {
    expect(resolveScopedSources([], ['integration:notion'])).toEqual({ sources: ['integration:notion'] })
    expect(resolveScopedSources(undefined, ['integration:notion'])).toEqual({ sources: ['integration:notion'] })
  })

  it('accepts requested sources inside the scope', () => {
    expect(resolveScopedSources(['a'], ['a', 'b'])).toEqual({ sources: ['a'] })
  })

  it('reports the requested sources outside the scope', () => {
    expect(resolveScopedSources(['a', 'c', 'd'], ['a', 'b'])).toEqual({ denied: ['c', 'd'] })
  })
})

describe('executeAskSoporti', () => {
  it('returns the streamed answer text', async () => {
    run.mockResolvedValue(makeStream([textDelta('Two payments '), textDelta('failed.')]))

    const answer = await executeAskSoporti({ question: 'What failed?', sources: [], skillIds: [], userId: 7 })

    expect(answer).toBe('Two payments failed.')
  })

  it('appends the consulted sources footer', async () => {
    run.mockResolvedValue(
      makeStream([toolCall('search_notion_pages'), toolOutput(), textDelta('It failed because of X.')])
    )

    const answer = await executeAskSoporti({ question: 'Why?', sources: ['yolo'], skillIds: [], userId: 7 })

    expect(answer).toBe('It failed because of X.\n\n---\n_Sources consulted: Notion_')
  })

  it('builds the agent with the sources, profile, custom instructions and skills', async () => {
    const skills = [{ id: 3, name: 'triage' }]
    getSkillsByIds.mockResolvedValue(skills)

    await executeAskSoporti({
      question: 'Why?',
      sources: ['integration:sentry'],
      profile: 'tech',
      skillIds: [3],
      userId: 7,
    })

    expect(getSkillsByIds).toHaveBeenCalledWith([3], 7)
    expect(createAgent).toHaveBeenCalledWith(['integration:sentry'], 'tech', {
      customInstructions: 'Be brief.',
      skills,
      skillArguments: 'Why?',
    })
  })

  it('sends the similar cases in the user turn, ahead of the question', async () => {
    searchSimilarCases.mockResolvedValue([{ question: 'Why did it fail?', answer: 'The card expired.' }])

    await executeAskSoporti({ question: 'What failed?', sources: [], skillIds: [], userId: 7 })

    const [, input] = run.mock.calls[0]
    expect(input).toContain('The card expired.')
    expect(input.endsWith('What failed?')).toBe(true)
  })

  it('runs without custom instructions when they cannot be loaded', async () => {
    getCustomInstructions.mockRejectedValue(new Error('db down'))

    await executeAskSoporti({ question: 'Why?', sources: [], skillIds: [], userId: 7 })

    expect(createAgent).toHaveBeenCalledWith([], undefined, {
      customInstructions: '',
      skills: [],
      skillArguments: 'Why?',
    })
  })

  it('runs without skills when they cannot be loaded', async () => {
    getSkillsByIds.mockRejectedValue(new Error('db down'))

    await executeAskSoporti({ question: 'Why?', sources: [], skillIds: [9], userId: 7 })

    expect(createAgent).toHaveBeenCalledWith([], undefined, {
      customInstructions: 'Be brief.',
      skills: [],
      skillArguments: 'Why?',
    })
  })

  it('reports progress when tools start and finish', async () => {
    run.mockResolvedValue(
      makeStream([toolCall('search_code', '{"repo":"x"}', 'c1'), toolOutput('c1'), textDelta('Found it.')])
    )
    const onProgress = vi.fn()

    await executeAskSoporti({ question: 'Why?', sources: [], skillIds: [], userId: 7, onProgress })

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, 'Consulting search_code...')
    expect(onProgress).toHaveBeenNthCalledWith(2, 'search_code completed')
  })

  it('keeps running when a progress report fails', async () => {
    run.mockResolvedValue(makeStream([toolCall('search_code'), textDelta('Found it.')]))
    const onProgress = vi.fn().mockRejectedValue(new Error('stream gone'))

    const answer = await executeAskSoporti({ question: 'Why?', sources: [], skillIds: [], userId: 7, onProgress })

    expect(answer).toContain('Found it.')
  })

  it('records the run on the mcp channel with its usage and tools', async () => {
    run.mockResolvedValue(
      makeStream([textDelta('Done.')], {
        state: { usage: { requests: 2, inputTokens: 900, outputTokens: 40 } },
        newItems: [{ type: 'tool_call_item', rawItem: { name: 'query_database', arguments: '{}' } }],
      })
    )

    await executeAskSoporti({ question: 'Why?', sources: [], skillIds: [], userId: 7 })

    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'mcp',
      status: 'ok',
      subject: null,
      usage: { requests: 2, inputTokens: 900, outputTokens: 40, cachedInputTokens: 0, cacheWriteTokens: 0 },
      durationMs: expect.any(Number),
      tools: ['query_database'],
    })
  })

  it('records a failed run and rethrows when the agent fails', async () => {
    run.mockRejectedValue(new Error('model unavailable'))

    await expect(executeAskSoporti({ question: 'Why?', sources: [], skillIds: [], userId: 7 })).rejects.toThrow(
      'model unavailable'
    )

    expect(recordAgentRun).toHaveBeenCalledWith({ channel: 'mcp', status: 'error', subject: null })
  })

  it('throws when the assistant answers with nothing', async () => {
    run.mockResolvedValue(makeStream([textDelta('   ')]))

    await expect(executeAskSoporti({ question: 'Why?', sources: [], skillIds: [], userId: 7 })).rejects.toThrow(
      'empty answer'
    )
  })
})
