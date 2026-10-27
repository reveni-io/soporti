import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCustomSpan, setTraceProcessors, setTracingDisabled } from '@openai/agents'

vi.mock('../db/agent-runs.js', () => ({ recordAgentRun: vi.fn() }))

const { recordAgentRun } = await import('../db/agent-runs.js')
const { traceAgentRun, trackAgentRun } = await import('./run-tracking.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('trackAgentRun', () => {
  it('records the usage, duration and tool names the run reported', async () => {
    const runResult = {
      finalOutput: 'done',
      state: { usage: { requests: 2, inputTokens: 900, outputTokens: 30 } },
      newItems: [{ type: 'tool_call_item', rawItem: { name: 'search_code' } }],
    }

    const { result, durationMs } = await trackAgentRun({ channel: 'web', subject: 'acme/app#3' }, async () => runResult)

    expect(result).toBe(runResult)
    expect(durationMs).toBeGreaterThanOrEqual(0)
    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'web',
      status: 'ok',
      subject: 'acme/app#3',
      userId: null,
      usage: { requests: 2, inputTokens: 900, outputTokens: 30, cachedInputTokens: 0, cacheWriteTokens: 0 },
      durationMs: expect.any(Number),
      tools: ['search_code'],
    })
  })

  it('defaults the subject to null and reports no usage when the run never provided any', async () => {
    await trackAgentRun({ channel: 'schedule' }, async () => ({}))

    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'schedule',
      status: 'ok',
      subject: null,
      userId: null,
      usage: null,
      durationMs: expect.any(Number),
      tools: [],
    })
  })

  it('attributes the run to the user it was given', async () => {
    await trackAgentRun({ channel: 'mcp', userId: 8 }, async () => ({}))

    expect(recordAgentRun).toHaveBeenCalledWith(expect.objectContaining({ channel: 'mcp', userId: 8 }))
  })

  it('passes the result to failureReason and keeps the run ok when it finds nothing wrong', async () => {
    const runResult = { finalOutput: 'done' }
    const failureReason = vi.fn(() => null)

    const { result } = await trackAgentRun({ channel: 'schedule', failureReason }, async () => runResult)

    expect(result).toBe(runResult)
    expect(failureReason).toHaveBeenCalledWith(runResult)
    expect(recordAgentRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }))
  })

  it('keeps the usage of a completed run that failed validation and throws the reason', async () => {
    const runResult = {
      finalOutput: '',
      state: { usage: { requests: 20, inputTokens: 400_000, outputTokens: 0 } },
      newItems: [{ type: 'tool_call_item', rawItem: { name: 'search_code' } }],
    }

    await expect(
      trackAgentRun(
        { channel: 'pr_review', subject: 'acme/app#9', failureReason: () => 'hit the turn limit' },
        async () => runResult
      )
    ).rejects.toThrow('hit the turn limit')

    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'pr_review',
      status: 'error',
      subject: 'acme/app#9',
      userId: null,
      usage: { requests: 20, inputTokens: 400_000, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0 },
      durationMs: expect.any(Number),
      tools: ['search_code'],
    })
  })

  it('records a failed run and rethrows what the agent threw', async () => {
    const boom = new Error('model unavailable')

    await expect(
      trackAgentRun({ channel: 'pr_review', subject: 'acme/app#7' }, async () => Promise.reject(boom))
    ).rejects.toBe(boom)

    expect(recordAgentRun).toHaveBeenCalledTimes(1)
    expect(recordAgentRun).toHaveBeenCalledWith({
      channel: 'pr_review',
      status: 'error',
      subject: 'acme/app#7',
      userId: null,
    })
  })
})

describe('traceAgentRun', () => {
  const endedSpans = []
  const CAPTURING_PROCESSOR = {
    onTraceStart: async () => {},
    onTraceEnd: async () => {},
    onSpanStart: async () => {},
    onSpanEnd: async span => {
      endedSpans.push(span)
    },
    shutdown: async () => {},
    forceFlush: async () => {},
  }

  beforeEach(() => {
    endedSpans.length = 0
    setTraceProcessors([CAPTURING_PROCESSOR])
    setTracingDisabled(false)
  })

  afterEach(() => {
    setTracingDisabled(true)
  })

  function runWithOneSpan() {
    const span = createCustomSpan({ data: { name: 'step', data: {} } })
    span.start()
    span.end()

    return 'answer'
  }

  it.each([
    {
      kind: 'every field as a string',
      fields: { sessionId: 'conv-1', userId: 7, question: 'Why did order 42 fail?' },
      metadata: { sessionId: 'conv-1', userId: '7', question: 'Why did order 42 fail?' },
    },
    {
      kind: 'only the fields that have a value',
      fields: { sessionId: 'acme/app#3', userId: null, question: '' },
      metadata: { sessionId: 'acme/app#3' },
    },
    { kind: 'nothing when no field has a value', fields: {}, metadata: {} },
  ])('stamps $kind on every span of the run', async ({ fields, metadata }) => {
    const result = await traceAgentRun(fields, async () => runWithOneSpan())

    expect(result).toBe('answer')
    expect(endedSpans).toHaveLength(1)
    expect(endedSpans[0].traceMetadata).toEqual(metadata)
  })

  it('lets the run error through unchanged', async () => {
    const failure = new Error('model unavailable')

    await expect(
      traceAgentRun({ sessionId: 'conv-1' }, async () => {
        throw failure
      })
    ).rejects.toBe(failure)
  })
})
