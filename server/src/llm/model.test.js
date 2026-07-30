import { describe, it, expect, vi, beforeEach } from 'vitest'

const setTracingDisabled = vi.fn()
vi.mock('@openai/agents', () => ({ setTracingDisabled }))

const openaiProvider = {
  id: 'openai',
  label: 'OpenAI',
  continuationToken: true,
  isConfigured: vi.fn(),
  buildModel: vi.fn(),
  modelSettings: vi.fn(),
  wrapSession: vi.fn(),
}

const anthropicProvider = {
  id: 'anthropic',
  label: 'Anthropic',
  continuationToken: false,
  isConfigured: vi.fn(),
  buildModel: vi.fn(),
  modelSettings: vi.fn(),
  wrapSession: vi.fn(),
}

const PROVIDERS = { openai: openaiProvider, anthropic: anthropicProvider }

vi.mock('./registry.js', () => ({ getProvider: id => PROVIDERS[id] ?? PROVIDERS.openai }))

const getLlmProvider = vi.fn()
const getReasoningEffort = vi.fn()
vi.mock('./settings.js', () => ({ getLlmProvider, getReasoningEffort }))

const { describeProvider, isConfigured, resolveModelForAgent, usesContinuationToken, wrapSession } =
  await import('./model.js')

beforeEach(() => {
  getLlmProvider.mockReset().mockResolvedValue('openai')
  getReasoningEffort.mockReset().mockResolvedValue('medium')
  for (const provider of [openaiProvider, anthropicProvider]) {
    provider.isConfigured.mockReset()
    provider.buildModel.mockReset()
    provider.modelSettings.mockReset()
    provider.wrapSession.mockReset()
  }
})

describe('tracing', () => {
  it('is disabled on import so no conversation content is exported to a third party', () => {
    expect(setTracingDisabled).toHaveBeenCalledWith(true)
  })
})

describe('describeProvider', () => {
  it('reports the stored provider label and whether it is configured', async () => {
    getLlmProvider.mockResolvedValue('anthropic')
    anthropicProvider.isConfigured.mockResolvedValue(true)

    expect(await describeProvider()).toEqual({ label: 'Anthropic', configured: true })
  })

  it('falls back to the default provider when nothing is stored', async () => {
    getLlmProvider.mockResolvedValue(null)
    openaiProvider.isConfigured.mockResolvedValue(false)

    expect(await describeProvider()).toEqual({ label: 'OpenAI', configured: false })
  })

  it('falls back to the default provider when the stored id is no longer registered', async () => {
    getLlmProvider.mockResolvedValue('gemini')
    openaiProvider.isConfigured.mockResolvedValue(true)

    expect(await describeProvider()).toEqual({ label: 'OpenAI', configured: true })
  })
})

describe('isConfigured', () => {
  it('delegates to the active provider', async () => {
    getLlmProvider.mockResolvedValue('anthropic')
    anthropicProvider.isConfigured.mockResolvedValue(true)

    expect(await isConfigured()).toBe(true)
    expect(anthropicProvider.isConfigured).toHaveBeenCalledTimes(1)
    expect(openaiProvider.isConfigured).not.toHaveBeenCalled()
  })
})

describe('resolveModelForAgent', () => {
  it('returns a handle carrying the model and the settings built with the stored effort', async () => {
    getReasoningEffort.mockResolvedValue('high')
    openaiProvider.buildModel.mockResolvedValue({ modelId: 'gpt-5.2-codex', model: 'gpt-5.2-codex' })
    openaiProvider.modelSettings.mockReturnValue({ reasoning: { effort: 'high' } })

    expect(await resolveModelForAgent()).toEqual({
      model: 'gpt-5.2-codex',
      modelSettings: { reasoning: { effort: 'high' } },
    })
    expect(openaiProvider.modelSettings).toHaveBeenCalledWith('gpt-5.2-codex', { effort: 'high' })
  })

  it('falls back to the default effort when nothing is stored', async () => {
    getReasoningEffort.mockResolvedValue(null)
    openaiProvider.buildModel.mockResolvedValue({ modelId: 'gpt-4o', model: 'gpt-4o' })
    openaiProvider.modelSettings.mockReturnValue({})

    await resolveModelForAgent()

    expect(openaiProvider.modelSettings).toHaveBeenCalledWith('gpt-4o', { effort: 'medium' })
  })

  it('falls back to the default effort when the stored value is not a supported level', async () => {
    getReasoningEffort.mockResolvedValue('xhigh')
    openaiProvider.buildModel.mockResolvedValue({ modelId: 'gpt-4o', model: 'gpt-4o' })
    openaiProvider.modelSettings.mockReturnValue({})

    await resolveModelForAgent()

    expect(openaiProvider.modelSettings).toHaveBeenCalledWith('gpt-4o', { effort: 'medium' })
  })

  it('resolves the effort through the active provider, not the default one', async () => {
    getLlmProvider.mockResolvedValue('anthropic')
    getReasoningEffort.mockResolvedValue('low')
    anthropicProvider.buildModel.mockResolvedValue({ modelId: 'claude-opus-5', model: 'claude-opus-5' })
    anthropicProvider.modelSettings.mockReturnValue({})

    await resolveModelForAgent()

    expect(anthropicProvider.modelSettings).toHaveBeenCalledWith('claude-opus-5', { effort: 'low' })
    expect(openaiProvider.modelSettings).not.toHaveBeenCalled()
  })

  it('surfaces the provider error when the credentials are missing', async () => {
    openaiProvider.buildModel.mockRejectedValue(new Error('OpenAI API key not configured.'))
    await expect(resolveModelForAgent()).rejects.toThrow(/API key not configured/i)
  })
})

describe('wrapSession', () => {
  it('lets the active provider decide how to wrap the session', async () => {
    getLlmProvider.mockResolvedValue('anthropic')
    const underlying = { id: 'postgres-session' }
    anthropicProvider.wrapSession.mockReturnValue(underlying)

    expect(await wrapSession(underlying)).toBe(underlying)
    expect(anthropicProvider.wrapSession).toHaveBeenCalledWith(underlying)
  })
})

describe('usesContinuationToken', () => {
  it('is true for openai, which stores the conversation server-side', async () => {
    getLlmProvider.mockResolvedValue('openai')
    expect(await usesContinuationToken()).toBe(true)
  })

  it('is false for anthropic, whose messages api is stateless', async () => {
    getLlmProvider.mockResolvedValue('anthropic')
    expect(await usesContinuationToken()).toBe(false)
  })
})
