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

const provider = await import('./openai.js')

beforeEach(() => {
  setDefaultOpenAIClient.mockReset()
  compactionSessionConstructor.mockReset()
  openaiConstructor.mockReset()
  getOpenAIApiKey.mockReset()
  getOpenAIModel.mockReset()
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
  it('accepts a caller own model instead of the globally stored one', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue(null)

    expect(await provider.isConfigured({ modelId: 'gpt-5.2' })).toBe(true)
    expect(getOpenAIModel).not.toHaveBeenCalled()
  })

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

  it('uses an overriding model id instead of the stored one', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue('gpt-5.2-codex')

    expect(await provider.buildModel({ modelId: 'gpt-4o-mini' })).toEqual({
      modelId: 'gpt-4o-mini',
      model: 'gpt-4o-mini',
    })
  })

  it('falls back to the stored model when the override is null', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue('gpt-5.2-codex')

    expect(await provider.buildModel({ modelId: null })).toEqual({
      modelId: 'gpt-5.2-codex',
      model: 'gpt-5.2-codex',
    })
  })

  it('still refuses an override when no key is configured', async () => {
    getOpenAIApiKey.mockResolvedValue(null)
    await expect(provider.buildModel({ modelId: 'gpt-4o-mini' })).rejects.toThrow(/API key not configured/i)
  })
})

describe('modelSettings', () => {
  it('applies the effort it was given to reasoning-capable models', () => {
    expect(provider.modelSettings('gpt-5.2', { effort: 'high' })).toEqual({ reasoning: { effort: 'high' } })
    expect(provider.modelSettings('o3', { effort: 'low' })).toEqual({ reasoning: { effort: 'low' } })
  })

  it('pins verbosity for codex models while still honouring the effort', () => {
    expect(provider.modelSettings('gpt-5.2-codex', { effort: 'low' })).toEqual({
      reasoning: { effort: 'low' },
      text: { verbosity: 'medium' },
    })
    expect(provider.modelSettings('gpt-5-codex', { effort: 'high' })).toEqual({
      reasoning: { effort: 'high' },
      text: { verbosity: 'medium' },
    })
  })

  it('leaves a non-reasoning model on the SDK defaults, because it would reject the effort', () => {
    expect(provider.modelSettings('gpt-4o', { effort: 'high' })).toEqual({})
  })

  it('sends nothing when no effort is resolved', () => {
    expect(provider.modelSettings('gpt-5.2', { effort: '' })).toEqual({})
    expect(provider.modelSettings('gpt-5.2-codex', { effort: undefined })).toEqual({})
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
