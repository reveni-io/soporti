import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const isProviderConfigured = vi.fn()
vi.mock('../llm/model.js', () => ({ isProviderConfigured }))

const { _resetLlmSettingsCacheForTests } = await import('../llm/settings.js')
const {
  getVideoModel,
  getVideoModelSelection,
  isVideoConfigured,
  parseVideoEffort,
  parseVideoModel,
  parseVideoProvider,
  setVideoEffort,
  setVideoModel,
  setVideoProvider,
  _resetVideoSettingsCacheForTests,
} = await import('./settings.js')

const CACHE_TTL_MS = 60_000

let stored = {}

function videoReads() {
  return getConfigValue.mock.calls.filter(([key]) => key.startsWith('video_')).length
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetVideoSettingsCacheForTests()
  _resetLlmSettingsCacheForTests()
  stored = {}
  getConfigValue.mockImplementation(async key => stored[key] ?? null)
  setConfigValue.mockImplementation(async (key, value) => {
    stored[key] = value
  })
  isProviderConfigured.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getVideoModelSelection', () => {
  it('falls back to the default provider at max effort when nothing is stored', async () => {
    expect(await getVideoModelSelection()).toEqual({ provider: 'openai', model: null, effort: 'max' })
  })

  it('follows the chat provider and its LLM section model while the video ones are unset', async () => {
    stored = { llm_provider: 'anthropic', anthropic_model: 'claude-opus-5', openai_model: 'gpt-5.2' }

    expect(await getVideoModelSelection()).toEqual({ provider: 'anthropic', model: 'claude-opus-5', effort: 'max' })
  })

  it('uses the stored video provider, model and effort over the chat settings', async () => {
    stored = {
      llm_provider: 'anthropic',
      anthropic_model: 'claude-sonnet-5',
      video_provider: 'openai',
      video_model: 'gpt-5.2-codex',
      video_effort: 'xhigh',
    }

    expect(await getVideoModelSelection()).toEqual({ provider: 'openai', model: 'gpt-5.2-codex', effort: 'xhigh' })
  })

  it('takes the LLM section model of the video provider, not the one of the chat provider', async () => {
    stored = {
      llm_provider: 'openai',
      openai_model: 'gpt-5.2',
      anthropic_model: 'claude-opus-5',
      video_provider: 'anthropic',
    }

    expect(await getVideoModelSelection()).toEqual({ provider: 'anthropic', model: 'claude-opus-5', effort: 'max' })
  })

  it('ignores a stored provider or effort that is no longer supported', async () => {
    stored = { llm_provider: 'gemini', video_provider: 'gemini', video_effort: 'extreme' }

    expect(await getVideoModelSelection()).toEqual({ provider: 'openai', model: null, effort: 'max' })
  })

  it('treats a blank stored model as unset', async () => {
    stored = { video_model: '   ', openai_model: 'gpt-5.2' }

    expect((await getVideoModelSelection()).model).toBe('gpt-5.2')
  })

  it('reads the stored video values once per minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    stored = { video_provider: 'anthropic' }

    await getVideoModelSelection()
    stored.video_provider = 'openai'
    const cached = await getVideoModelSelection()
    vi.advanceTimersByTime(CACHE_TTL_MS + 1)
    const refreshed = await getVideoModelSelection()

    expect(cached.provider).toBe('anthropic')
    expect(refreshed.provider).toBe('openai')
    expect(videoReads()).toBe(6)
  })
})

describe('the video setters', () => {
  it('take effect on the next read without waiting for the cache', async () => {
    expect(await getVideoModelSelection()).toEqual({ provider: 'openai', model: null, effort: 'max' })

    await setVideoProvider('anthropic')
    await setVideoModel('claude-opus-5')
    await setVideoEffort('high')

    expect(await getVideoModelSelection()).toEqual({ provider: 'anthropic', model: 'claude-opus-5', effort: 'high' })
    expect(setConfigValue).toHaveBeenCalledTimes(3)
    expect(setConfigValue).toHaveBeenCalledWith('video_provider', 'anthropic')
    expect(setConfigValue).toHaveBeenCalledWith('video_model', 'claude-opus-5')
    expect(setConfigValue).toHaveBeenCalledWith('video_effort', 'high')
  })

  it('goes back to the LLM section model when the video model is cleared', async () => {
    stored = { video_model: 'gpt-5.2-codex', openai_model: 'gpt-5.2' }
    expect(await getVideoModel()).toBe('gpt-5.2-codex')

    await setVideoModel('')

    expect(await getVideoModel()).toBeNull()
    expect((await getVideoModelSelection()).model).toBe('gpt-5.2')
  })
})

describe('isVideoConfigured', () => {
  it('checks the resolved provider credentials with the resolved model', async () => {
    stored = { llm_provider: 'anthropic', anthropic_model: 'claude-opus-5' }

    expect(await isVideoConfigured()).toBe(true)
    expect(isProviderConfigured).toHaveBeenCalledTimes(1)
    expect(isProviderConfigured).toHaveBeenCalledWith('anthropic', { model: 'claude-opus-5' })
  })

  it('is false when the provider is missing its credentials or a model', async () => {
    isProviderConfigured.mockResolvedValue(false)

    expect(await isVideoConfigured()).toBe(false)
    expect(isProviderConfigured).toHaveBeenCalledWith('openai', { model: null })
  })
})

describe('parseVideoProvider', () => {
  it('accepts a registered provider', () => {
    expect(parseVideoProvider('anthropic')).toEqual({ value: 'anthropic' })
    expect(parseVideoProvider('openai')).toEqual({ value: 'openai' })
  })

  it('rejects an unknown or missing provider', () => {
    const expected = { error: 'That is not a supported LLM provider.' }

    expect(parseVideoProvider('gemini')).toEqual(expected)
    expect(parseVideoProvider(undefined)).toEqual(expected)
    expect(parseVideoProvider(42)).toEqual(expected)
  })
})

describe('parseVideoModel', () => {
  it('trims the model id', () => {
    expect(parseVideoModel('  claude-opus-5\n')).toEqual({ value: 'claude-opus-5' })
  })

  it('turns an empty or blank value into a clear', () => {
    expect(parseVideoModel('')).toEqual({ value: '' })
    expect(parseVideoModel('   ')).toEqual({ value: '' })
  })

  it('rejects a value that is not a string', () => {
    expect(parseVideoModel(null)).toEqual({
      error: 'The model must be a string (empty to use the LLM section model).',
    })
  })

  it('rejects a model id with spaces or over 100 characters', () => {
    const expected = { error: 'The model must be a single id without spaces, up to 100 characters.' }

    expect(parseVideoModel('claude opus')).toEqual(expected)
    expect(parseVideoModel('m'.repeat(101))).toEqual(expected)
    expect(parseVideoModel('m'.repeat(100))).toEqual({ value: 'm'.repeat(100) })
  })
})

describe('parseVideoEffort', () => {
  it('accepts every extended effort level', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(parseVideoEffort(effort)).toEqual({ value: effort })
    }
  })

  it('rejects any other value', () => {
    const expected = { error: 'That is not a supported reasoning effort.' }

    expect(parseVideoEffort('extreme')).toEqual(expected)
    expect(parseVideoEffort(undefined)).toEqual(expected)
  })
})
