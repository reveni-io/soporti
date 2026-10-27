import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BatchTraceProcessor, Span, Trace } from '@openai/agents'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const { exportSpans, getLastExportError, resetExportFailure } = await import('./client.js')
const {
  LANGFUSE_PUBLIC_KEY_KEY,
  LANGFUSE_SECRET_KEY_KEY,
  LANGFUSE_HOST_KEY,
  LANGFUSE_METADATA_ONLY_KEY,
  _resetLangfuseSettingsCacheForTests,
} = await import('./settings.js')

const HOST = 'https://langfuse.example.com/sub'
const SECRET = 'sk-lf-very-secret'
const SENTINEL = 'SENTINEL-CONTENT'
const GITHUB_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz0123'
const TRACE_ID = 'trace_0123456789abcdef0123456789abcdef'
const STARTED_AT = '2026-10-26T10:00:00.000Z'
const ENDED_AT = '2026-10-26T10:00:01.500Z'
const NO_OP_PROCESSOR = {
  onSpanStart: async () => {},
  onSpanEnd: async () => {},
  onTraceStart: async () => {},
  onTraceEnd: async () => {},
}

function storeConfig(overrides = {}) {
  const values = {
    [LANGFUSE_PUBLIC_KEY_KEY]: 'pk-lf-public',
    [LANGFUSE_SECRET_KEY_KEY]: SECRET,
    [LANGFUSE_HOST_KEY]: HOST,
    [LANGFUSE_METADATA_ONLY_KEY]: false,
    ...overrides,
  }
  getConfigValue.mockImplementation(async key => values[key] ?? null)
}

function buildSpan(data, options = {}) {
  return new Span(
    { traceId: TRACE_ID, startedAt: STARTED_AT, endedAt: ENDED_AT, parentId: null, data, ...options },
    NO_OP_PROCESSOR
  )
}

function sentSpans(callIndex = 0) {
  return JSON.parse(fetch.mock.calls[callIndex][1].body).resourceSpans[0].scopeSpans[0].spans
}

function attributesOf(otlpSpan) {
  return Object.fromEntries(otlpSpan.attributes.map(({ key, value }) => [key, value.stringValue ?? value.intValue]))
}

beforeEach(() => {
  getConfigValue.mockReset()
  _resetLangfuseSettingsCacheForTests()
  resetExportFailure()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  storeConfig()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('exportSpans mapping', () => {
  it.each([
    {
      kind: 'agent',
      data: { type: 'agent', name: 'Soporti Review Verifier', tools: ['read_file'] },
      name: 'Soporti Review Verifier',
      expected: { 'langfuse.observation.type': 'agent' },
    },
    {
      kind: 'function',
      data: { type: 'function', name: 'read_file', input: '{"path":"a.js"}', output: 'const a = 1' },
      name: 'read_file',
      expected: {
        'langfuse.observation.type': 'tool',
        'langfuse.observation.input': '{"path":"a.js"}',
        'langfuse.observation.output': 'const a = 1',
      },
    },
    {
      kind: 'anthropic generation',
      data: {
        type: 'generation',
        model: 'anthropic.messages:claude-sonnet-5-5',
        input: [{ role: 'user', content: 'hi' }],
        output: [{ role: 'assistant', content: 'hello' }],
        usage: { input_tokens: 12, output_tokens: 7 },
      },
      name: 'claude-sonnet-5-5',
      expected: {
        'langfuse.observation.type': 'generation',
        'langfuse.observation.model.name': 'claude-sonnet-5-5',
        'gen_ai.usage.input_tokens': 12,
        'gen_ai.usage.output_tokens': 7,
        'langfuse.observation.input': '[{"role":"user","content":"hi"}]',
        'langfuse.observation.output': '[{"role":"assistant","content":"hello"}]',
      },
    },
    {
      kind: 'openai response',
      data: {
        type: 'response',
        response_id: 'resp_1',
        _input: 'what broke?',
        _response: {
          model: 'gpt-5.5',
          instructions: 'You review PRs.',
          usage: { input_tokens: 40, output_tokens: 9 },
          output: [{ type: 'message', content: 'nothing' }],
        },
      },
      name: 'gpt-5.5',
      expected: {
        'langfuse.observation.type': 'generation',
        'langfuse.observation.model.name': 'gpt-5.5',
        'gen_ai.usage.input_tokens': 40,
        'gen_ai.usage.output_tokens': 9,
        'langfuse.observation.input':
          '[{"role":"system","content":"You review PRs."},{"role":"user","content":"what broke?"}]',
        'langfuse.observation.output': '[{"type":"message","content":"nothing"}]',
      },
    },
    {
      kind: 'openai response that failed before answering',
      data: { type: 'response', _input: [{ role: 'user', content: 'hi' }] },
      name: 'response',
      expected: {
        'langfuse.observation.type': 'generation',
        'langfuse.observation.input': '[{"role":"user","content":"hi"}]',
      },
    },
    {
      kind: 'unmapped type',
      data: { type: 'custom', name: 'c', data: { secret: SENTINEL } },
      name: 'custom',
      expected: { 'langfuse.observation.type': 'span' },
    },
  ])('maps a $kind span to its Langfuse observation', async ({ data, name, expected }) => {
    await exportSpans([buildSpan(data)])

    const [otlpSpan] = sentSpans()
    expect(otlpSpan.name).toBe(name)
    expect(attributesOf(otlpSpan)).toEqual(expected)
  })

  it('posts OTLP JSON to the configured host with basic auth and the real-time ingestion header', async () => {
    await exportSpans([buildSpan({ type: 'agent', name: 'Soporti' })])

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe(`${HOST}/api/public/otel/v1/traces`)
    expect(options.method).toBe('POST')
    expect(options.redirect).toBe('error')
    expect(options.headers).toEqual({
      Authorization: `Basic ${Buffer.from(`pk-lf-public:${SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
      'x-langfuse-ingestion-version': '4',
    })
  })

  it('converts ids to stable hex, keeps parent links across batches and leaves roots without a parent', async () => {
    const root = buildSpan({ type: 'agent', name: 'Soporti' }, { spanId: 'span_aaaaaaaaaaaaaaaaaaaaaaaa' })
    const child = buildSpan(
      { type: 'function', name: 'read_file', input: '{}', output: 'x' },
      { spanId: 'span_bbbbbbbbbbbbbbbbbbbbbbbb', parentId: 'span_aaaaaaaaaaaaaaaaaaaaaaaa' }
    )

    await exportSpans([child])
    await exportSpans([root])

    const [sentChild] = sentSpans(0)
    const [sentRoot] = sentSpans(1)
    expect(sentRoot.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(sentRoot.spanId).toMatch(/^[0-9a-f]{16}$/)
    expect(sentChild.traceId).toBe(sentRoot.traceId)
    expect(sentChild.parentSpanId).toBe(sentRoot.spanId)
    expect(sentRoot).not.toHaveProperty('parentSpanId')
  })

  it.each([
    { kind: 'both times', startedAt: STARTED_AT, start: '1793008800000000000', end: '1793008801500000000' },
    { kind: 'no start time', startedAt: null, start: '1793008801500000000', end: '1793008801500000000' },
  ])('sends unix nanosecond timestamps for a span with $kind', async ({ startedAt, start, end }) => {
    await exportSpans([buildSpan({ type: 'agent', name: 'Soporti' }, { startedAt })])

    const [otlpSpan] = sentSpans()
    expect(otlpSpan.startTimeUnixNano).toBe(start)
    expect(otlpSpan.endTimeUnixNano).toBe(end)
  })

  it('falls back to a generic message for a failed span without one', async () => {
    await exportSpans([buildSpan({ type: 'agent', name: 'Soporti' }, { error: { message: '' } })])

    expect(sentSpans()[0].status).toEqual({ code: 2, message: 'Span failed' })
  })

  it('marks a failed span as an error with its redacted message and never sends the error data', async () => {
    const span = buildSpan(
      { type: 'function', name: 'read_file', input: '{}', output: '' },
      { error: { message: `boom ${GITHUB_TOKEN}`, data: { error: SENTINEL } } }
    )

    await exportSpans([span])

    const [otlpSpan] = sentSpans()
    expect(otlpSpan.status).toEqual({ code: 2, message: 'boom [redacted]' })
    expect(attributesOf(otlpSpan)['langfuse.observation.level']).toBe('ERROR')
    expect(fetch.mock.calls[0][1].body).not.toContain(SENTINEL)
  })
})

describe('exportSpans content safety', () => {
  const CONTENT_SPANS = [
    { type: 'agent', name: 'Soporti', tools: ['read_file'] },
    { type: 'function', name: 'read_file', input: SENTINEL, output: SENTINEL, mcp_data: SENTINEL },
    { type: 'generation', model: 'openai:gpt-5.5', input: [{ content: SENTINEL }], output: [{ content: SENTINEL }] },
    { type: 'response', _input: SENTINEL, _response: { model: 'gpt-5.5', instructions: SENTINEL, output: SENTINEL } },
    { type: 'handoff', from_agent: 'a', to_agent: 'b' },
    { type: 'custom', name: 'c', data: { text: SENTINEL } },
    { type: 'guardrail', name: 'g', triggered: true },
    { type: 'mcp_tools', server: 's', result: [SENTINEL] },
    { type: 'transcription', input: { data: SENTINEL, format: 'pcm' }, output: SENTINEL },
    { type: 'speech', input: SENTINEL, output: { data: SENTINEL, format: 'pcm' } },
    { type: 'speech_group', input: SENTINEL },
  ]

  it.each(CONTENT_SPANS)('sends no content from a $type span in metadata-only mode', async data => {
    storeConfig({ [LANGFUSE_METADATA_ONLY_KEY]: true })
    const span = buildSpan(data, { error: { message: SENTINEL, data: { error: SENTINEL } } })

    await exportSpans([span])

    const body = fetch.mock.calls[0][1].body
    expect(body).not.toContain(SENTINEL)
    expect(sentSpans()[0].status).toEqual({ code: 2, message: 'Span failed' })
  })

  it.each(CONTENT_SPANS.filter(data => !['agent', 'function', 'generation', 'response'].includes(data.type)))(
    'sends no content from an unmapped $type span even with full content on',
    async data => {
      await exportSpans([buildSpan(data)])

      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch.mock.calls[0][1].body).not.toContain(SENTINEL)
    }
  )

  it('keeps the model and token usage in metadata-only mode', async () => {
    storeConfig({ [LANGFUSE_METADATA_ONLY_KEY]: true })
    const span = buildSpan({
      type: 'generation',
      model: 'anthropic.messages:claude-sonnet-5-5',
      input: [{ content: SENTINEL }],
      usage: { input_tokens: 3, output_tokens: 4 },
    })

    await exportSpans([span])

    expect(attributesOf(sentSpans()[0])).toEqual({
      'langfuse.observation.type': 'generation',
      'langfuse.observation.model.name': 'claude-sonnet-5-5',
      'gen_ai.usage.input_tokens': 3,
      'gen_ai.usage.output_tokens': 4,
    })
  })

  it.each([
    { kind: 'a raw tool output', output: `token on a new line\n${GITHUB_TOKEN}` },
    { kind: 'a JSON-encoded tool output', output: JSON.stringify({ content: `line one\n${GITHUB_TOKEN}` }) },
    {
      kind: 'a nested JSON tool output',
      output: JSON.stringify({ files: [JSON.stringify({ body: `\n${GITHUB_TOKEN}` })] }),
    },
  ])('redacts secrets inside $kind before it leaves the process', async ({ output }) => {
    await exportSpans([buildSpan({ type: 'function', name: 'read_file', input: '{}', output })])

    const body = fetch.mock.calls[0][1].body
    expect(body).not.toContain(GITHUB_TOKEN)
    expect(body).toContain('[redacted]')
  })

  it('redacts a secret before truncating so a token cut by the cap never leaks its start', async () => {
    const output = `${'x'.repeat(15_989)} ${GITHUB_TOKEN} ${'y'.repeat(20_000)}`

    await exportSpans([buildSpan({ type: 'function', name: 'read_file', input: '{}', output })])

    expect(fetch.mock.calls[0][1].body).not.toContain('ghp_')
  })

  it('drops content that cannot be serialized and still sends the span', async () => {
    const circular = { name: 'loop' }
    circular.self = circular

    await exportSpans([buildSpan({ type: 'function', name: 'read_file', input: circular, output: 'ok' })])

    expect(attributesOf(sentSpans()[0])).toEqual({
      'langfuse.observation.type': 'tool',
      'langfuse.observation.output': 'ok',
    })
  })

  it('truncates oversized content in the middle so the latest message survives the cap', async () => {
    const input = [
      { role: 'system', content: 'p'.repeat(50_000) },
      { role: 'user', content: 'hi' },
    ]

    await exportSpans([buildSpan({ type: 'generation', model: 'anthropic.messages:claude-sonnet-5-5', input })])

    const sent = attributesOf(sentSpans()[0])['langfuse.observation.input']
    expect(sent).toHaveLength(32_000 + '\n… [truncated] …\n'.length)
    expect(sent.startsWith('[{"role":"system","content":"ppp')).toBe(true)
    expect(sent.includes('\n… [truncated] …\n')).toBe(true)
    expect(sent.endsWith('{"role":"user","content":"hi"}]')).toBe(true)
  })

  it('sends token counts as JSON numbers, the only int form older Langfuse versions read', async () => {
    await exportSpans([
      buildSpan({ type: 'generation', model: 'openai:gpt-5.5', usage: { input_tokens: 120, output_tokens: 30 } }),
    ])

    const usage = sentSpans()[0].attributes.filter(({ key }) => key.startsWith('gen_ai.usage.'))
    expect(usage).toEqual([
      { key: 'gen_ai.usage.input_tokens', value: { intValue: 120 } },
      { key: 'gen_ai.usage.output_tokens', value: { intValue: 30 } },
    ])
  })
})

describe('exportSpans trace input, output and grouping', () => {
  const ROOT_ID = 'span_root00000000000000000000'
  const META = { sessionId: 'conv-1', userId: '7', question: 'Why did order 42 fail?' }

  function rootAgent(options = {}) {
    return buildSpan({ type: 'agent', name: 'Soporti' }, { spanId: ROOT_ID, traceMetadata: META, ...options })
  }

  function aiSdkGeneration(output, options = {}) {
    return buildSpan(
      { type: 'generation', model: 'anthropic.messages:claude-sonnet-5-5', input: [], output },
      { parentId: ROOT_ID, traceMetadata: META, ...options }
    )
  }

  function assistantMessage(text) {
    return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }
  }

  function rootOf(callIndex) {
    return attributesOf(sentSpans(callIndex).find(span => !span.parentSpanId))
  }

  it.each([
    {
      kind: 'an ai-sdk answer',
      spans: () => [aiSdkGeneration([assistantMessage('The carrier rejected it.')]), rootAgent()],
      answer: 'The carrier rejected it.',
    },
    {
      kind: 'an OpenAI answer',
      spans: () => [
        buildSpan(
          {
            type: 'response',
            _input: 'q',
            _response: { model: 'gpt-5.5', output: [assistantMessage('Stock ran out.')] },
          },
          { parentId: ROOT_ID, traceMetadata: META }
        ),
        rootAgent(),
      ],
      answer: 'Stock ran out.',
    },
    {
      kind: 'the last text answer when the final step only called a tool',
      spans: () => [
        aiSdkGeneration([assistantMessage('Checking the order first.')]),
        aiSdkGeneration([{ type: 'function_call', name: 'query_database', arguments: '{}' }]),
        rootAgent(),
      ],
      answer: 'Checking the order first.',
    },
    {
      kind: 'only the assistant text, never reasoning or tool calls',
      spans: () => [
        aiSdkGeneration([
          { type: 'reasoning', content: [{ type: 'input_text', text: 'thinking about it' }] },
          assistantMessage('Final answer.'),
          { type: 'function_call', name: 'read_file', arguments: '{}' },
        ]),
        rootAgent(),
      ],
      answer: 'Final answer.',
    },
  ])('gives the root the question and $kind', async ({ spans, answer }) => {
    await exportSpans(spans())

    expect(rootOf(0)).toMatchObject({
      'langfuse.observation.input': 'Why did order 42 fail?',
      'langfuse.observation.output': answer,
      'session.id': 'conv-1',
      'user.id': '7',
    })
  })

  it('keeps the answer across export batches until the root arrives', async () => {
    await exportSpans([aiSdkGeneration([assistantMessage('Answer from an earlier batch.')])])
    await exportSpans([rootAgent()])

    expect(rootOf(1)['langfuse.observation.output']).toBe('Answer from an earlier batch.')
  })

  it('stamps the session and user on every span so wrapped-up runs still group', async () => {
    await exportSpans([aiSdkGeneration([assistantMessage('a')])])

    expect(attributesOf(sentSpans()[0])).toMatchObject({ 'session.id': 'conv-1', 'user.id': '7' })
  })

  it.each([
    {
      kind: 'a generation, which keeps its own input and output',
      span: () => aiSdkGeneration([assistantMessage('own output')]),
      expected: {
        'langfuse.observation.input': '[]',
        'langfuse.observation.output': JSON.stringify([assistantMessage('own output')]),
      },
    },
    {
      kind: 'a nested agent, which gets none',
      span: () => buildSpan({ type: 'agent', name: 'Sub' }, { parentId: ROOT_ID, traceMetadata: META }),
      expected: {},
    },
  ])('never puts the run question on $kind', async ({ span, expected }) => {
    await exportSpans([span()])

    const attributes = attributesOf(sentSpans()[0])
    expect(attributes['langfuse.observation.input']).toBe(expected['langfuse.observation.input'])
    expect(attributes['langfuse.observation.output']).toBe(expected['langfuse.observation.output'])
  })

  it.each([
    { kind: 'no trace metadata', traceMetadata: undefined },
    { kind: 'empty trace metadata', traceMetadata: {} },
  ])('sends a root with $kind as before, without question, answer or ids', async ({ traceMetadata }) => {
    await exportSpans([buildSpan({ type: 'agent', name: 'Soporti' }, { traceMetadata })])

    expect(attributesOf(sentSpans()[0])).toEqual({ 'langfuse.observation.type': 'agent' })
  })

  it('sends no question, answer or ids in metadata-only mode', async () => {
    storeConfig({ [LANGFUSE_METADATA_ONLY_KEY]: true })

    await exportSpans([aiSdkGeneration([assistantMessage('secret answer')]), rootAgent()])

    const body = fetch.mock.calls[0][1].body
    expect(body).not.toContain('secret answer')
    expect(body).not.toContain('Why did order 42 fail?')
    expect(body).not.toContain('conv-1')
  })

  it('redacts secrets in the question and the answer', async () => {
    const meta = { ...META, question: `use ${GITHUB_TOKEN}` }

    await exportSpans([
      aiSdkGeneration([assistantMessage(`token ${GITHUB_TOKEN}`)], { traceMetadata: meta }),
      rootAgent({ traceMetadata: meta }),
    ])

    expect(fetch.mock.calls[0][1].body).not.toContain(GITHUB_TOKEN)
    expect(rootOf(0)['langfuse.observation.input']).toBe('use [redacted]')
  })

  it('gives a root that failed no answer', async () => {
    await exportSpans([aiSdkGeneration([assistantMessage('partial')]), rootAgent({ error: { message: 'x' } })])

    expect(rootOf(0)).not.toHaveProperty('langfuse.observation.output')
  })

  it('does not reuse an answer once its root has been sent', async () => {
    await exportSpans([aiSdkGeneration([assistantMessage('first run')]), rootAgent()])
    await exportSpans([rootAgent({ spanId: 'span_root11111111111111111111' })])

    expect(rootOf(1)).not.toHaveProperty('langfuse.observation.output')
  })

  it('keeps answers of another trace apart', async () => {
    await exportSpans([
      aiSdkGeneration([assistantMessage('other trace')], { traceId: 'trace_ffffffffffffffffffffffffffffffff' }),
    ])
    await exportSpans([rootAgent()])

    expect(rootOf(1)).not.toHaveProperty('langfuse.observation.output')
  })

  function reconfigure(overrides) {
    _resetLangfuseSettingsCacheForTests()
    storeConfig(overrides)
  }

  it.each([
    {
      kind: 'Langfuse is not configured',
      first: () => storeConfig({ [LANGFUSE_HOST_KEY]: null }),
      answer: null,
    },
    {
      kind: 'metadata only is on',
      first: () => storeConfig({ [LANGFUSE_METADATA_ONLY_KEY]: true }),
      answer: null,
    },
    {
      kind: 'the settings cannot be read for a moment',
      first: () => getConfigValue.mockRejectedValue(new Error('db down')),
      answer: 'kept answer',
    },
  ])('treats a pending answer as expected when $kind', async ({ first, answer }) => {
    first()
    await exportSpans([aiSdkGeneration([assistantMessage('kept answer')])])

    reconfigure()
    await exportSpans([rootAgent()])

    const roots = sentSpans(fetch.mock.calls.length - 1).filter(span => !span.parentSpanId)
    expect(attributesOf(roots[0])['langfuse.observation.output'] ?? null).toBe(answer)
  })

  it('drops pending answers when the export failure is reset after a settings change', async () => {
    await exportSpans([aiSdkGeneration([assistantMessage('before the change')])])

    resetExportFailure()
    await exportSpans([rootAgent()])

    expect(rootOf(1)).not.toHaveProperty('langfuse.observation.output')
  })

  it('keeps a trace that keeps answering ahead of older ones when the limit is reached', async () => {
    const traceIds = Array.from({ length: 101 }, (_, index) => `trace_${String(index).padStart(32, '0')}`)
    await exportSpans(traceIds.slice(0, 100).map(traceId => aiSdkGeneration([assistantMessage(traceId)], { traceId })))
    await exportSpans([aiSdkGeneration([assistantMessage('still going')], { traceId: traceIds[0] })])
    await exportSpans([aiSdkGeneration([assistantMessage(traceIds[100])], { traceId: traceIds[100] })])

    await exportSpans([rootAgent({ traceId: traceIds[0] }), rootAgent({ traceId: traceIds[1], spanId: 'span_root3' })])

    const roots = sentSpans(fetch.mock.calls.length - 1).map(attributesOf)
    expect(roots.map(attributes => attributes['langfuse.observation.output'] ?? null)).toEqual(['still going', null])
  })

  it('truncates a long answer once, with a single marker', async () => {
    await exportSpans([aiSdkGeneration([assistantMessage('a'.repeat(50_000))]), rootAgent()])

    const output = rootOf(0)['langfuse.observation.output']
    expect(output).toHaveLength(32_000 + '\n… [truncated] …\n'.length)
    expect(output.split('[truncated]')).toHaveLength(2)
  })

  it('caps the session and user ids at two hundred characters', async () => {
    const meta = { ...META, sessionId: 's'.repeat(300) }

    await exportSpans([rootAgent({ traceMetadata: meta })])

    expect(rootOf(0)['session.id']).toBe('s'.repeat(200))
  })

  it('forgets the oldest answers beyond one hundred pending traces', async () => {
    const traceIds = Array.from({ length: 101 }, (_, index) => `trace_${String(index).padStart(32, '0')}`)
    await exportSpans(traceIds.map(traceId => aiSdkGeneration([assistantMessage(traceId)], { traceId })))

    await exportSpans([
      rootAgent({ traceId: traceIds[0] }),
      rootAgent({ traceId: traceIds[100], spanId: 'span_root2' }),
    ])

    const roots = sentSpans(fetch.mock.calls.length - 1).map(attributesOf)
    expect(roots.map(attributes => attributes['langfuse.observation.output'] ?? null)).toEqual([null, traceIds[100]])
  })
})

describe('exportSpans delivery', () => {
  it.each([
    { kind: 'no public key', overrides: { [LANGFUSE_PUBLIC_KEY_KEY]: null } },
    { kind: 'no secret key', overrides: { [LANGFUSE_SECRET_KEY_KEY]: '' } },
    { kind: 'no host', overrides: { [LANGFUSE_HOST_KEY]: null } },
  ])('sends nothing when Langfuse has $kind', async ({ overrides }) => {
    storeConfig(overrides)

    await exportSpans([buildSpan({ type: 'agent', name: 'Soporti' })])

    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'an empty batch', items: () => [] },
    { kind: 'a trace item', items: () => [new Trace({ traceId: TRACE_ID, name: 'Agent workflow' }, NO_OP_PROCESSOR)] },
    {
      kind: 'a span that never started',
      items: () => [buildSpan({ type: 'agent', name: 'Soporti' }, { startedAt: null, endedAt: null })],
    },
  ])('sends nothing for $kind', async ({ items }) => {
    await exportSpans(items())

    expect(fetch).not.toHaveBeenCalled()
    expect(getLastExportError()).toBeNull()
  })

  it('skips the batch without reporting Langfuse as unreachable when the settings cannot be read', async () => {
    getConfigValue.mockRejectedValue(new Error('db down'))

    await exportSpans([buildSpan({ type: 'agent', name: 'Soporti' })])

    expect(fetch).not.toHaveBeenCalled()
    expect(getLastExportError()).toBeNull()
  })

  it('splits a large batch into requests of at most 20 spans and stops after a failed one', async () => {
    const spans = Array.from({ length: 45 }, (_, index) => buildSpan({ type: 'agent', name: `Soporti ${index}` }))

    await exportSpans(spans)
    expect(fetch.mock.calls.map((_, call) => sentSpans(call).length)).toEqual([20, 20, 5])

    fetch.mockClear()
    fetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await exportSpans(spans)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('bounds every request with a timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')

    await exportSpans([buildSpan({ type: 'agent', name: 'Soporti' })])

    expect(timeout).toHaveBeenCalledTimes(1)
    expect(timeout).toHaveBeenCalledWith(15_000)
  })

  it('resumes exporting right away once the failure is reset', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401 })
    const span = buildSpan({ type: 'agent', name: 'Soporti' })

    await exportSpans([span])
    resetExportFailure()
    await exportSpans([span])

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(getLastExportError()).toBeNull()
  })

  it('records a rejected export, pauses exporting for a minute and clears the error once one succeeds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'))
    fetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const span = buildSpan({ type: 'agent', name: 'Soporti' })

    await exportSpans([span])
    expect(getLastExportError()).toEqual({ status: 404, at: '2026-10-26T10:00:00.000Z' })

    await exportSpans([span])
    expect(fetch).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-10-26T10:01:01.000Z'))
    await exportSpans([span])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(getLastExportError()).toBeNull()
  })

  it('records a network failure as status 0 without throwing or logging the credentials', async () => {
    fetch.mockRejectedValueOnce(Object.assign(new Error(`connect failed ${SECRET}`), { name: 'TypeError' }))

    await expect(exportSpans([buildSpan({ type: 'agent', name: 'Soporti' })])).resolves.toBeUndefined()

    expect(getLastExportError()).toMatchObject({ status: 0 })
    expect(JSON.stringify(console.error.mock.calls)).not.toContain(SECRET)
  })

  it('aborts the request when the processor signal aborts', async () => {
    const controller = new AbortController()

    await exportSpans([buildSpan({ type: 'agent', name: 'Soporti' })], controller.signal)
    controller.abort()

    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('receives the spans a real batch processor flushes', async () => {
    const processor = new BatchTraceProcessor({ export: exportSpans })
    const trace = new Trace({ traceId: TRACE_ID, name: 'Agent workflow' }, processor)
    const span = new Span({ traceId: TRACE_ID, data: { type: 'agent', name: 'Soporti' } }, processor)

    await trace.start()
    span.start()
    span.end()
    await processor.forceFlush()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sentSpans().map(otlpSpan => otlpSpan.name)).toEqual(['Soporti'])
  })
})
