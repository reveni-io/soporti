import { describe, it, expect, vi, beforeEach } from 'vitest'

const anthropicFactory = vi.fn()
const innerModel = {
  specificationVersion: 'v3',
  provider: 'anthropic.messages',
  supportedUrls: { 'image/*': [/^https?:\/\/.*$/] },
  doGenerate: vi.fn(),
  doStream: vi.fn(),
}
const createAnthropic = vi.fn(opts => {
  anthropicFactory(opts)
  return modelId => ({ ...innerModel, modelId })
})
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic }))

const aisdk = vi.fn(rawModel => ({ wrapped: rawModel }))
vi.mock('@openai/agents-extensions/ai-sdk', () => ({ aisdk }))

const getAnthropicApiKey = vi.fn()
const getAnthropicModel = vi.fn()
vi.mock('./settings.js', () => ({ getAnthropicApiKey, getAnthropicModel }))

const provider = await import('./anthropic.js')

const CONTEXT_WINDOW_TOKENS = 1_000_000
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUg=='
const SCREENSHOT_URL = 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/frame.png'

beforeEach(() => {
  anthropicFactory.mockReset()
  createAnthropic.mockClear()
  aisdk.mockClear()
  getAnthropicApiKey.mockReset()
  getAnthropicModel.mockReset()
  innerModel.doGenerate.mockReset()
  innerModel.doStream.mockReset()
})

function anthropicMessageResponse() {
  return new Response(
    JSON.stringify({
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      model: 'claude-opus-5',
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

describe('the anthropic provider descriptor', () => {
  it('is registered as anthropic and never round-trips a continuation token', () => {
    expect(provider.id).toBe('anthropic')
    expect(provider.label).toBe('Anthropic')
    expect(provider.continuationToken).toBe(false)
  })
})

describe('isConfigured', () => {
  it('accepts a caller own model instead of the globally stored one', async () => {
    getAnthropicApiKey.mockResolvedValue('sk-ant-abc')
    getAnthropicModel.mockResolvedValue(null)

    expect(await provider.isConfigured({ modelId: 'claude-sonnet-5' })).toBe(true)
    expect(getAnthropicModel).not.toHaveBeenCalled()
  })

  it('requires both the key and the model', async () => {
    getAnthropicApiKey.mockResolvedValue('sk-ant-abc')
    getAnthropicModel.mockResolvedValue('claude-opus-5')
    expect(await provider.isConfigured()).toBe(true)

    getAnthropicModel.mockResolvedValue(null)
    expect(await provider.isConfigured()).toBe(false)

    getAnthropicApiKey.mockResolvedValue(null)
    getAnthropicModel.mockResolvedValue('claude-opus-5')
    expect(await provider.isConfigured()).toBe(false)
  })
})

describe('buildModel', () => {
  it('wraps the ai-sdk model built from the stored key and model id', async () => {
    getAnthropicApiKey.mockResolvedValue('sk-ant-abc')
    getAnthropicModel.mockResolvedValue('claude-opus-5')

    const { modelId, model } = await provider.buildModel()

    expect(modelId).toBe('claude-opus-5')
    expect(anthropicFactory).toHaveBeenCalledTimes(1)
    expect(anthropicFactory).toHaveBeenCalledWith({ apiKey: 'sk-ant-abc' })
    expect(aisdk).toHaveBeenCalledTimes(1)
    expect(model.wrapped.provider).toBe('anthropic.messages')
    expect(model.wrapped.modelId).toBe('claude-opus-5')
  })

  it('rebuilds against the current key so rotation needs no restart', async () => {
    getAnthropicApiKey.mockResolvedValue('sk-ant-old')
    getAnthropicModel.mockResolvedValue('claude-opus-5')
    await provider.buildModel()

    getAnthropicApiKey.mockResolvedValue('sk-ant-new')
    await provider.buildModel()

    expect(anthropicFactory).toHaveBeenNthCalledWith(1, { apiKey: 'sk-ant-old' })
    expect(anthropicFactory).toHaveBeenNthCalledWith(2, { apiKey: 'sk-ant-new' })
  })

  it('throws a clear error when no key is configured', async () => {
    getAnthropicApiKey.mockResolvedValue(null)
    await expect(provider.buildModel()).rejects.toThrow(/API key not configured/i)
  })

  it('throws a clear error when the model is not configured', async () => {
    getAnthropicApiKey.mockResolvedValue('sk-ant-abc')
    getAnthropicModel.mockResolvedValue(null)
    await expect(provider.buildModel()).rejects.toThrow(/model not configured/i)
  })

  it('builds an overriding model id instead of the stored one', async () => {
    getAnthropicApiKey.mockResolvedValue('sk-ant-abc')
    getAnthropicModel.mockResolvedValue('claude-opus-5')

    const { modelId, model } = await provider.buildModel({ modelId: 'claude-sonnet-5' })

    expect(modelId).toBe('claude-sonnet-5')
    expect(model.wrapped.modelId).toBe('claude-sonnet-5')
  })

  it('falls back to the stored model when the override is null', async () => {
    getAnthropicApiKey.mockResolvedValue('sk-ant-abc')
    getAnthropicModel.mockResolvedValue('claude-opus-5')

    const { modelId } = await provider.buildModel({ modelId: null })

    expect(modelId).toBe('claude-opus-5')
  })

  it('still refuses an override when no key is configured', async () => {
    getAnthropicApiKey.mockResolvedValue(null)
    await expect(provider.buildModel({ modelId: 'claude-sonnet-5' })).rejects.toThrow(/API key not configured/i)
  })
})

describe('the model handed to the adapter', () => {
  async function buildWrappedModel() {
    getAnthropicApiKey.mockResolvedValue('sk-ant-abc')
    getAnthropicModel.mockResolvedValue('claude-opus-5')

    const { model } = await provider.buildModel()
    return model.wrapped
  }

  function screenshotToolMessage(value) {
    return {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_1',
          toolName: 'get_figma_screenshot',
          output: { type: 'content', value },
        },
      ],
    }
  }

  it('exposes the identity of the anthropic model it wraps', async () => {
    const wrapped = await buildWrappedModel()

    expect(wrapped.specificationVersion).toBe('v3')
    expect(wrapped.provider).toBe('anthropic.messages')
    expect(wrapped.modelId).toBe('claude-opus-5')
    expect(wrapped.supportedUrls).toBe(innerModel.supportedUrls)
  })

  it.each(['doGenerate', 'doStream'])(
    'turns the media parts of a tool result into anthropic image parts on %s',
    async method => {
      const result = { content: [] }
      innerModel[method].mockResolvedValue(result)
      const wrapped = await buildWrappedModel()
      const base64Part = { type: 'media', data: PNG_BASE64, mediaType: 'image/png' }
      const urlPart = { type: 'media', data: SCREENSHOT_URL, mediaType: 'image/*' }
      const prompt = [screenshotToolMessage([{ type: 'text', text: '{"nodeId":"1:2"}' }, base64Part, urlPart])]

      const returned = await wrapped[method]({ prompt, maxOutputTokens: 512 })

      expect(returned).toBe(result)
      expect(innerModel[method]).toHaveBeenCalledTimes(1)
      const [sent] = innerModel[method].mock.calls[0]
      expect(sent.maxOutputTokens).toBe(512)
      expect(sent.prompt[0].content[0].output.value).toEqual([
        { type: 'text', text: '{"nodeId":"1:2"}' },
        { type: 'image-data', data: PNG_BASE64, mediaType: 'image/png' },
        { type: 'image-url', url: SCREENSHOT_URL },
      ])
      expect(prompt[0].content[0].output.value[1]).toBe(base64Part)
      expect(base64Part).toEqual({ type: 'media', data: PNG_BASE64, mediaType: 'image/png' })
    }
  )

  it.each(['doGenerate', 'doStream'])('passes every other message and part through untouched on %s', async method => {
    const wrapped = await buildWrappedModel()
    const userMessage = { role: 'user', content: [{ type: 'text', text: 'show me the frame' }] }
    const assistantMessage = {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'get_figma_screenshot', input: {} }],
    }
    const textResult = {
      type: 'tool-result',
      toolCallId: 'call_2',
      toolName: 'search',
      output: { type: 'text', value: 'ok' },
    }
    const approval = { type: 'tool-approval-response', approvalId: 'approval_1', approved: true }
    const svgPart = { type: 'media', data: 'PHN2Zz48L3N2Zz4=', mediaType: 'image/svg+xml' }
    const imagePart = { type: 'image-data', data: PNG_BASE64, mediaType: 'image/png' }
    const toolMessage = screenshotToolMessage([svgPart, imagePart])
    toolMessage.content.push(textResult, approval)
    const tools = [{ type: 'function', name: 'search', inputSchema: {} }]

    await wrapped[method]({ prompt: [userMessage, assistantMessage, toolMessage], tools })

    expect(innerModel[method]).toHaveBeenCalledTimes(1)
    const [sent] = innerModel[method].mock.calls[0]
    expect(sent.tools).toBe(tools)
    expect(sent.prompt[0]).toBe(userMessage)
    expect(sent.prompt[1]).toBe(assistantMessage)
    expect(sent.prompt[2].content[0].output.value[0]).toBe(svgPart)
    expect(sent.prompt[2].content[0].output.value[1]).toBe(imagePart)
    expect(sent.prompt[2].content[1]).toBe(textResult)
    expect(sent.prompt[2].content[2]).toBe(approval)
  })

  it('sends an image a tool returned to anthropic as an image block of the tool result', async () => {
    const { createAnthropic: realCreateAnthropic } = await vi.importActual('@ai-sdk/anthropic')
    const { aisdk: realAisdk } = await vi.importActual('@openai/agents-extensions/ai-sdk')
    const { withTrace } = await import('@openai/agents')
    const fetch = vi.fn().mockResolvedValue(anthropicMessageResponse())
    createAnthropic.mockImplementationOnce(opts => realCreateAnthropic({ ...opts, fetch }))
    aisdk.mockImplementationOnce(realAisdk)
    getAnthropicApiKey.mockResolvedValue('sk-ant-abc')
    getAnthropicModel.mockResolvedValue('claude-opus-5')
    const input = [
      { type: 'message', role: 'user', content: 'show me the frame' },
      { type: 'function_call', callId: 'call_1', name: 'get_figma_screenshot', arguments: '{}', status: 'completed' },
      {
        type: 'function_call_result',
        callId: 'call_1',
        name: 'get_figma_screenshot',
        status: 'completed',
        output: [
          { type: 'input_text', text: 'frame 1:2' },
          { type: 'input_image', image: `data:image/png;base64,${PNG_BASE64}` },
          { type: 'input_image', image: SCREENSHOT_URL },
        ],
      },
    ]

    const { model } = await provider.buildModel()
    const request = { input, modelSettings: {}, tools: [], handoffs: [], outputType: 'text', tracing: false }
    await withTrace('anthropic-tool-image-test', () => model.getResponse(request))

    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    const toolResult = body.messages.flatMap(message => message.content).find(block => block.type === 'tool_result')
    expect(toolResult.tool_use_id).toBe('call_1')
    expect(toolResult.content).toEqual([
      { type: 'text', text: 'frame 1:2' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_BASE64 } },
      { type: 'image', source: { type: 'url', url: SCREENSHOT_URL } },
    ])
  })
})

describe('modelSettings', () => {
  it('nests the anthropic options under providerData.providerOptions so the adapter forwards them', () => {
    const settings = provider.modelSettings('claude-opus-5', { intent: 'chat' })

    expect(Object.keys(settings.providerData)).toEqual(['providerOptions'])
    expect(Object.keys(settings.providerData.providerOptions)).toEqual(['anthropic'])
  })

  it('requests prompt caching so the tools and system prefix are not re-billed every turn', () => {
    for (const intent of ['chat', 'review']) {
      const { anthropic } = provider.modelSettings('claude-opus-5', { intent }).providerData.providerOptions

      expect(anthropic.cacheControl).toEqual({ type: 'ephemeral' })
    }
  })

  it('uses adaptive thinking rather than a token budget, which current models reject', () => {
    const { anthropic } = provider.modelSettings('claude-opus-5', { intent: 'chat' }).providerData.providerOptions

    expect(anthropic.thinking).toEqual({ type: 'adaptive' })
    expect(anthropic).not.toHaveProperty('budgetTokens')
    expect(anthropic.thinking).not.toHaveProperty('budgetTokens')
  })

  it('sends the effort it was given as the anthropic effort option', () => {
    for (const effort of ['low', 'medium', 'high']) {
      const { anthropic } = provider.modelSettings('claude-opus-5', { effort }).providerData.providerOptions

      expect(anthropic.effort).toBe(effort)
    }
  })

  it('drops an effort the anthropic api does not accept instead of forwarding it', () => {
    for (const effort of ['minimal', 'none', '', undefined]) {
      const { anthropic } = provider.modelSettings('claude-opus-5', { effort }).providerData.providerOptions

      expect(anthropic).not.toHaveProperty('effort')
    }
  })

  it('still returns the thinking and caching options when called with no effort at all', () => {
    const { anthropic } = provider.modelSettings('claude-opus-5').providerData.providerOptions

    expect(anthropic.thinking).toEqual({ type: 'adaptive' })
    expect(anthropic.cacheControl).toEqual({ type: 'ephemeral' })
    expect(anthropic).not.toHaveProperty('effort')
  })

  it('asks the runner to retry, because the adapter has no retries of its own', () => {
    const { retry } = provider.modelSettings('claude-opus-5', { intent: 'chat' })

    expect(retry.maxRetries).toBe(2)
    expect(typeof retry.policy).toBe('function')
  })
})

describe('modelSettings on the wire', () => {
  async function sendThroughRealAdapter(modelSettings) {
    const { createAnthropic: realCreateAnthropic } = await vi.importActual('@ai-sdk/anthropic')
    const { aisdk: realAisdk } = await vi.importActual('@openai/agents-extensions/ai-sdk')
    const fetch = vi.fn().mockResolvedValue(anthropicMessageResponse())

    const { withTrace } = await import('@openai/agents')
    const model = realAisdk(realCreateAnthropic({ apiKey: 'sk-test', fetch })('claude-opus-5'))
    const request = { input: 'hi', modelSettings, tools: [], handoffs: [], outputType: 'text', tracing: false }
    await withTrace('anthropic-wire-test', () => model.getResponse(request))

    const [, init] = fetch.mock.calls[0]
    return { fetch, body: JSON.parse(init.body), betas: new Headers(init.headers).get('anthropic-beta') }
  }

  it('asks anthropic to clear old tool results only near the context window, never those of write tools', async () => {
    const { WRITE_TOOL_NAMES } = await import('../agent/sources.js')

    const { fetch, body, betas } = await sendThroughRealAdapter(provider.modelSettings('claude-opus-5'))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(betas).toContain('context-management-2025-06-27')
    expect(body.context_management.edits).toHaveLength(1)

    const [edit] = body.context_management.edits
    expect(edit.type).toBe('clear_tool_uses_20250919')
    expect(edit.exclude_tools).toEqual(WRITE_TOOL_NAMES)
    expect(edit.exclude_tools).toContain('post_slack_message')
    expect(edit.trigger.value).toBeLessThan(CONTEXT_WINDOW_TOKENS)
    expect(edit.clear_at_least.value).toBeGreaterThan(0)
    expect(edit.keep.value).toBeGreaterThan(0)
    expect(edit.clear_tool_inputs).not.toBe(true)
  })

  it('keeps sending thinking and caching alongside the clearing edit', async () => {
    const { body } = await sendThroughRealAdapter(provider.modelSettings('claude-opus-5', { effort: 'high' }))

    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.cache_control).toEqual({ type: 'ephemeral' })
  })
})

describe('retryPolicy', () => {
  it('retries transient transport failures', () => {
    expect(provider.retryPolicy({ normalized: { isAbort: false, isNetworkError: true } })).toBe(true)
  })

  it('retries rate limits and server errors', () => {
    for (const statusCode of [408, 429, 500, 503, 529]) {
      expect(provider.retryPolicy({ normalized: { isAbort: false, isNetworkError: false, statusCode } })).toBe(true)
    }
  })

  it('does not retry a client error the request will never pass', () => {
    for (const statusCode of [400, 401, 403, 404, 422]) {
      expect(provider.retryPolicy({ normalized: { isAbort: false, isNetworkError: false, statusCode } })).toBe(false)
    }
  })

  it('never retries an aborted request', () => {
    expect(provider.retryPolicy({ normalized: { isAbort: true, isNetworkError: true, statusCode: 429 } })).toBe(false)
  })

  it('does not retry when the error carries no status at all', () => {
    expect(provider.retryPolicy({ normalized: { isAbort: false, isNetworkError: false } })).toBe(false)
  })
})

describe('finalAnswerSettings', () => {
  it('leaves the tool choice alone, because the ai-sdk adapter drops every tool definition for none', () => {
    expect(provider.finalAnswerSettings()).toEqual({})
  })
})

describe('wrapSession', () => {
  it('returns the session untouched because compaction is an openai responses feature', () => {
    const underlying = { id: 'postgres-session' }
    expect(provider.wrapSession(underlying)).toBe(underlying)
  })
})
