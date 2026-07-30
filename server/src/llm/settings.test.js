import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getLlmProvider,
  setLlmProvider,
  getOpenAIApiKey,
  setOpenAIApiKey,
  getOpenAIModel,
  setOpenAIModel,
  getAnthropicApiKey,
  setAnthropicApiKey,
  getAnthropicModel,
  setAnthropicModel,
  getReasoningEffort,
  setReasoningEffort,
  REASONING_EFFORT_KEY,
  LLM_PROVIDER_KEY,
  OPENAI_API_KEY_KEY,
  OPENAI_MODEL_KEY,
  ANTHROPIC_API_KEY_KEY,
  ANTHROPIC_MODEL_KEY,
  _resetLlmSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetLlmSettingsCacheForTests()
})

describe('getLlmProvider', () => {
  it('returns the stored provider id', async () => {
    getConfigValue.mockResolvedValue('anthropic')
    expect(await getLlmProvider()).toBe('anthropic')
    expect(getConfigValue).toHaveBeenCalledWith(LLM_PROVIDER_KEY)
  })

  it('returns null when unset so the caller can fall back to the default', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getLlmProvider()).toBeNull()
  })

  it('saves the provider and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('openai')
    expect(await getLlmProvider()).toBe('openai')

    getConfigValue.mockResolvedValue('anthropic')
    await setLlmProvider('anthropic')

    expect(await getLlmProvider()).toBe('anthropic')
    expect(setConfigValue).toHaveBeenCalledWith(LLM_PROVIDER_KEY, 'anthropic')
  })
})

describe('getOpenAIApiKey', () => {
  it('returns the stored key', async () => {
    getConfigValue.mockResolvedValue('sk-stored')
    expect(await getOpenAIApiKey()).toBe('sk-stored')
    expect(getConfigValue).toHaveBeenCalledWith(OPENAI_API_KEY_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getOpenAIApiKey()).toBeNull()

    _resetLlmSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getOpenAIApiKey()).toBeNull()
  })

  it('caches the value between reads', async () => {
    getConfigValue.mockResolvedValue('sk-stored')
    await getOpenAIApiKey()
    await getOpenAIApiKey()
    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })

  it('invalidates the cache when the key is saved', async () => {
    getConfigValue.mockResolvedValue('sk-old')
    expect(await getOpenAIApiKey()).toBe('sk-old')

    getConfigValue.mockResolvedValue('sk-new')
    await setOpenAIApiKey('sk-new')

    expect(await getOpenAIApiKey()).toBe('sk-new')
    expect(setConfigValue).toHaveBeenCalledWith(OPENAI_API_KEY_KEY, 'sk-new')
  })
})

describe('getOpenAIModel', () => {
  it('returns the stored model (trimmed)', async () => {
    getConfigValue.mockResolvedValue('  gpt-5.2-codex  ')
    expect(await getOpenAIModel()).toBe('gpt-5.2-codex')
    expect(getConfigValue).toHaveBeenCalledWith(OPENAI_MODEL_KEY)
  })

  it('returns null when unset or empty (no default)', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getOpenAIModel()).toBeNull()

    _resetLlmSettingsCacheForTests()
    getConfigValue.mockResolvedValue('   ')
    expect(await getOpenAIModel()).toBeNull()
  })

  it('saves the model and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('gpt-4o')
    expect(await getOpenAIModel()).toBe('gpt-4o')

    getConfigValue.mockResolvedValue('gpt-5.2-codex')
    await setOpenAIModel('gpt-5.2-codex')

    expect(await getOpenAIModel()).toBe('gpt-5.2-codex')
    expect(setConfigValue).toHaveBeenCalledWith(OPENAI_MODEL_KEY, 'gpt-5.2-codex')
  })
})

describe('getAnthropicApiKey', () => {
  it('returns the stored key or null when unset', async () => {
    getConfigValue.mockResolvedValue('sk-ant-stored')
    expect(await getAnthropicApiKey()).toBe('sk-ant-stored')
    expect(getConfigValue).toHaveBeenCalledWith(ANTHROPIC_API_KEY_KEY)

    _resetLlmSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getAnthropicApiKey()).toBeNull()
  })

  it('saves the key and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('sk-ant-old')
    expect(await getAnthropicApiKey()).toBe('sk-ant-old')

    getConfigValue.mockResolvedValue('sk-ant-new')
    await setAnthropicApiKey('sk-ant-new')

    expect(await getAnthropicApiKey()).toBe('sk-ant-new')
    expect(setConfigValue).toHaveBeenCalledWith(ANTHROPIC_API_KEY_KEY, 'sk-ant-new')
  })
})

describe('getAnthropicModel', () => {
  it('returns the stored model (trimmed) or null when unset', async () => {
    getConfigValue.mockResolvedValue('  claude-opus-5  ')
    expect(await getAnthropicModel()).toBe('claude-opus-5')
    expect(getConfigValue).toHaveBeenCalledWith(ANTHROPIC_MODEL_KEY)

    _resetLlmSettingsCacheForTests()
    getConfigValue.mockResolvedValue('   ')
    expect(await getAnthropicModel()).toBeNull()
  })

  it('saves the model and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('claude-sonnet-5')
    expect(await getAnthropicModel()).toBe('claude-sonnet-5')

    getConfigValue.mockResolvedValue('claude-opus-5')
    await setAnthropicModel('claude-opus-5')

    expect(await getAnthropicModel()).toBe('claude-opus-5')
    expect(setConfigValue).toHaveBeenCalledWith(ANTHROPIC_MODEL_KEY, 'claude-opus-5')
  })
})

describe('getReasoningEffort', () => {
  it('returns the stored effort (trimmed) or null when unset', async () => {
    getConfigValue.mockResolvedValue('  high  ')
    expect(await getReasoningEffort()).toBe('high')
    expect(getConfigValue).toHaveBeenCalledWith(REASONING_EFFORT_KEY)

    _resetLlmSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    expect(await getReasoningEffort()).toBeNull()
  })

  it('saves the effort and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('medium')
    expect(await getReasoningEffort()).toBe('medium')

    getConfigValue.mockResolvedValue('low')
    await setReasoningEffort('low')

    expect(await getReasoningEffort()).toBe('low')
    expect(setConfigValue).toHaveBeenCalledWith(REASONING_EFFORT_KEY, 'low')
  })
})

describe('the settings cache', () => {
  it('keeps one entry per key so saving one value does not evict the others', async () => {
    getConfigValue.mockImplementation(async key => (key === OPENAI_API_KEY_KEY ? 'sk-abc' : 'gpt-4o'))

    expect(await getOpenAIApiKey()).toBe('sk-abc')
    expect(await getOpenAIModel()).toBe('gpt-4o')
    expect(getConfigValue).toHaveBeenCalledTimes(2)

    await setOpenAIModel('gpt-5.2')
    getConfigValue.mockResolvedValue('gpt-5.2')

    expect(await getOpenAIModel()).toBe('gpt-5.2')
    expect(await getOpenAIApiKey()).toBe('sk-abc')
    expect(getConfigValue).toHaveBeenCalledTimes(3)
  })
})
