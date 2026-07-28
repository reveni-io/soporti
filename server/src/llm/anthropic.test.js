import { describe, it, expect, vi, beforeEach } from 'vitest'

const anthropicFactory = vi.fn()
const createAnthropic = vi.fn(opts => {
  anthropicFactory(opts)
  return modelId => ({ provider: 'anthropic', modelId })
})
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic }))

const aisdk = vi.fn(rawModel => ({ wrapped: rawModel }))
vi.mock('@openai/agents-extensions/ai-sdk', () => ({ aisdk }))

const getAnthropicApiKey = vi.fn()
const getAnthropicModel = vi.fn()
vi.mock('./settings.js', () => ({ getAnthropicApiKey, getAnthropicModel }))

vi.mock('../config.js', () => ({ default: { review: { reasoningEffort: 'high' } } }))

const provider = await import('./anthropic.js')
const config = (await import('../config.js')).default

beforeEach(() => {
  anthropicFactory.mockReset()
  createAnthropic.mockClear()
  aisdk.mockClear()
  getAnthropicApiKey.mockReset()
  getAnthropicModel.mockReset()
  config.review.reasoningEffort = 'high'
})

describe('the anthropic provider descriptor', () => {
  it('is registered as anthropic and never round-trips a continuation token', () => {
    expect(provider.id).toBe('anthropic')
    expect(provider.label).toBe('Anthropic')
    expect(provider.continuationToken).toBe(false)
  })
})

describe('isConfigured', () => {
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
    expect(anthropicFactory).toHaveBeenCalledWith({ apiKey: 'sk-ant-abc' })
    expect(aisdk).toHaveBeenCalledWith({ provider: 'anthropic', modelId: 'claude-opus-5' })
    expect(model).toEqual({ wrapped: { provider: 'anthropic', modelId: 'claude-opus-5' } })
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
})

describe('modelSettings', () => {
  it('nests the anthropic options under providerData.providerOptions so the adapter forwards them', () => {
    const settings = provider.modelSettings('claude-opus-5', { intent: 'chat' })

    expect(settings.providerData).toEqual({
      providerOptions: { anthropic: { thinking: { type: 'adaptive' }, cacheControl: { type: 'ephemeral' } } },
    })
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

  it('adds the configured effort on a review turn', () => {
    const { anthropic } = provider.modelSettings('claude-opus-5', { intent: 'review' }).providerData.providerOptions

    expect(anthropic).toEqual({
      thinking: { type: 'adaptive' },
      cacheControl: { type: 'ephemeral' },
      effort: 'high',
    })
  })

  it('drops an effort the anthropic api does not accept', () => {
    config.review.reasoningEffort = 'minimal'
    const { anthropic } = provider.modelSettings('claude-opus-5', { intent: 'review' }).providerData.providerOptions

    expect(anthropic).toEqual({ thinking: { type: 'adaptive' }, cacheControl: { type: 'ephemeral' } })
  })

  it('never sends an effort on a chat turn', () => {
    const { anthropic } = provider.modelSettings('claude-opus-5', { intent: 'chat' }).providerData.providerOptions

    expect(anthropic).not.toHaveProperty('effort')
  })

  it('asks the runner to retry, because the adapter has no retries of its own', () => {
    const { retry } = provider.modelSettings('claude-opus-5', { intent: 'chat' })

    expect(retry.maxRetries).toBe(2)
    expect(typeof retry.policy).toBe('function')
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

describe('wrapSession', () => {
  it('returns the session untouched because compaction is an openai responses feature', () => {
    const underlying = { id: 'postgres-session' }
    expect(provider.wrapSession(underlying)).toBe(underlying)
  })
})
