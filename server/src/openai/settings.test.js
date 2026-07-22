import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getOpenAIApiKey,
  setOpenAIApiKey,
  getOpenAIModel,
  setOpenAIModel,
  getVectorStoreId,
  setVectorStoreId,
  OPENAI_API_KEY_KEY,
  OPENAI_MODEL_KEY,
  OPENAI_VECTOR_STORE_KEY,
  _resetSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetSettingsCacheForTests()
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

    _resetSettingsCacheForTests()
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

    _resetSettingsCacheForTests()
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

describe('getVectorStoreId', () => {
  it('returns the stored id or null when unset/empty', async () => {
    getConfigValue.mockResolvedValue('vs_123')
    expect(await getVectorStoreId()).toBe('vs_123')
    expect(getConfigValue).toHaveBeenCalledWith(OPENAI_VECTOR_STORE_KEY)

    _resetSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getVectorStoreId()).toBeNull()
  })

  it('saves the id and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('vs_old')
    expect(await getVectorStoreId()).toBe('vs_old')

    getConfigValue.mockResolvedValue('vs_new')
    await setVectorStoreId('vs_new')

    expect(await getVectorStoreId()).toBe('vs_new')
    expect(setConfigValue).toHaveBeenCalledWith(OPENAI_VECTOR_STORE_KEY, 'vs_new')
  })
})
