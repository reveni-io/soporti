import { describe, it, expect, vi, beforeEach } from 'vitest'

const setDefaultOpenAIClient = vi.fn()
const compactionSessionConstructor = vi.fn()
vi.mock('@openai/agents', () => ({
  setDefaultOpenAIClient,
  OpenAIResponsesCompactionSession: class MockCompactionSession {
    constructor(opts) {
      compactionSessionConstructor(opts)
      this.underlyingSession = opts.underlyingSession
      this.client = opts.client
    }
  },
}))

const openaiConstructor = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor(opts) {
      openaiConstructor(opts)
      this.apiKey = opts.apiKey
    }
  },
}))

const getOpenAIApiKey = vi.fn()
const getOpenAIModel = vi.fn()
vi.mock('./settings.js', () => ({ getOpenAIApiKey, getOpenAIModel }))

vi.mock('../config.js', () => ({ default: { review: { reasoningEffort: 'high' } } }))

const provider = await import('./openai.js')
const config = (await import('../config.js')).default

beforeEach(() => {
  setDefaultOpenAIClient.mockReset()
  compactionSessionConstructor.mockReset()
  openaiConstructor.mockReset()
  getOpenAIApiKey.mockReset()
  getOpenAIModel.mockReset()
  config.review.reasoningEffort = 'high'
  provider._resetOpenAIClientForTests()
})

describe('the openai provider descriptor', () => {
  it('is registered as openai and round-trips a continuation token', () => {
    expect(provider.id).toBe('openai')
    expect(provider.label).toBe('OpenAI')
    expect(provider.continuationToken).toBe(true)
  })
})

describe('the openai client', () => {
  it('never constructs a keyless client when no key is configured', async () => {
    getOpenAIApiKey.mockResolvedValue(null)

    await expect(provider.buildModel()).rejects.toThrow(/API key not configured/i)
    expect(openaiConstructor).not.toHaveBeenCalled()
    expect(setDefaultOpenAIClient).not.toHaveBeenCalled()
  })

  it('builds the client from the stored key and registers it as the Agents default', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue('gpt-4o')

    await provider.buildModel()

    expect(openaiConstructor).toHaveBeenCalledWith({ apiKey: 'sk-abc' })
    expect(setDefaultOpenAIClient).toHaveBeenCalledTimes(1)
    expect(setDefaultOpenAIClient.mock.calls[0][0].apiKey).toBe('sk-abc')
  })

  it('memoizes the client while the key is unchanged', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue('gpt-4o')

    await provider.buildModel()
    await provider.buildModel()

    expect(openaiConstructor).toHaveBeenCalledTimes(1)
    expect(setDefaultOpenAIClient).toHaveBeenCalledTimes(1)
  })

  it('rebuilds and re-registers when the key changes (rotation)', async () => {
    getOpenAIModel.mockResolvedValue('gpt-4o')
    getOpenAIApiKey.mockResolvedValue('sk-old')
    await provider.buildModel()

    getOpenAIApiKey.mockResolvedValue('sk-new')
    await provider.buildModel()

    expect(openaiConstructor).toHaveBeenCalledTimes(2)
    expect(setDefaultOpenAIClient.mock.calls[1][0].apiKey).toBe('sk-new')
  })
})

describe('isConfigured', () => {
  it('requires both the key and the model', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue('gpt-4o')
    expect(await provider.isConfigured()).toBe(true)

    getOpenAIModel.mockResolvedValue(null)
    expect(await provider.isConfigured()).toBe(false)

    getOpenAIApiKey.mockResolvedValue(null)
    getOpenAIModel.mockResolvedValue('gpt-4o')
    expect(await provider.isConfigured()).toBe(false)
  })
})

describe('buildModel', () => {
  it('returns the configured model id and ensures the default client is set', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue('gpt-5.2-codex')

    expect(await provider.buildModel()).toEqual({ modelId: 'gpt-5.2-codex', model: 'gpt-5.2-codex' })
    expect(setDefaultOpenAIClient).toHaveBeenCalledTimes(1)
  })

  it('throws a clear error when no key is configured', async () => {
    getOpenAIApiKey.mockResolvedValue(null)
    await expect(provider.buildModel()).rejects.toThrow(/API key not configured/i)
  })

  it('throws a clear error when the model is not configured (no default)', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue(null)
    await expect(provider.buildModel()).rejects.toThrow(/model not configured/i)
  })
})

describe('modelSettings', () => {
  it('forces reasoning and verbosity to medium for codex models on every intent', () => {
    const expected = { reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } }

    expect(provider.modelSettings('gpt-5.2-codex', { intent: 'chat' })).toEqual(expected)
    expect(provider.modelSettings('gpt-5-codex', { intent: 'review' })).toEqual(expected)
  })

  it('returns an empty object for a chat turn on a non-codex model', () => {
    expect(provider.modelSettings('gpt-4o', { intent: 'chat' })).toEqual({})
    expect(provider.modelSettings('gpt-5.2', { intent: 'chat' })).toEqual({})
  })

  it('applies the configured reasoning effort to reasoning-capable review models', () => {
    expect(provider.modelSettings('gpt-5.2', { intent: 'review' })).toEqual({ reasoning: { effort: 'high' } })
    expect(provider.modelSettings('o3', { intent: 'review' })).toEqual({ reasoning: { effort: 'high' } })
  })

  it('leaves a non-reasoning review model on the SDK defaults', () => {
    expect(provider.modelSettings('gpt-4o', { intent: 'review' })).toEqual({})
  })

  it('skips the reasoning effort when it is disabled', () => {
    config.review.reasoningEffort = 'none'
    expect(provider.modelSettings('gpt-5.2', { intent: 'review' })).toEqual({})

    config.review.reasoningEffort = ''
    expect(provider.modelSettings('gpt-5.2', { intent: 'review' })).toEqual({})
  })

  it('defaults to the chat intent when none is given', () => {
    expect(provider.modelSettings('gpt-5.2')).toEqual({})
  })
})

describe('wrapSession', () => {
  it('wraps the session in the compaction session when a client is available', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    const underlying = { id: 'postgres-session' }

    const wrapped = await provider.wrapSession(underlying)

    expect(wrapped.underlyingSession).toBe(underlying)
    expect(compactionSessionConstructor).toHaveBeenCalledTimes(1)
    expect(compactionSessionConstructor.mock.calls[0][0].client.apiKey).toBe('sk-abc')
  })

  it('returns the bare session when no key is configured instead of constructing a keyless client', async () => {
    getOpenAIApiKey.mockResolvedValue(null)
    const underlying = { id: 'postgres-session' }

    expect(await provider.wrapSession(underlying)).toBe(underlying)
    expect(compactionSessionConstructor).not.toHaveBeenCalled()
  })
})
