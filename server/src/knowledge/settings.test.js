import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const getOpenAIApiKey = vi.fn()
vi.mock('../llm/settings.js', () => ({ getOpenAIApiKey }))

const {
  getOwnApiKey,
  getKnowledgeApiKey,
  setKnowledgeApiKey,
  getVectorStoreId,
  setVectorStoreId,
  isKnowledgeConfigured,
  KNOWLEDGE_API_KEY_KEY,
  KNOWLEDGE_VECTOR_STORE_KEY,
  _resetKnowledgeSettingsCacheForTests,
} = await import('./settings.js')

beforeEach(() => {
  getConfigValue.mockReset().mockResolvedValue(null)
  setConfigValue.mockReset()
  getOpenAIApiKey.mockReset().mockResolvedValue(null)
  _resetKnowledgeSettingsCacheForTests()
})

describe('the stored config keys', () => {
  it('keeps the vector store on its original key so no data migration is needed', () => {
    expect(KNOWLEDGE_VECTOR_STORE_KEY).toBe('openai_vector_store_id')
  })
})

describe('getKnowledgeApiKey', () => {
  it('prefers its own key when one is stored', async () => {
    getConfigValue.mockResolvedValue('sk-knowledge')
    getOpenAIApiKey.mockResolvedValue('sk-provider')

    expect(await getKnowledgeApiKey()).toBe('sk-knowledge')
    expect(getConfigValue).toHaveBeenCalledWith(KNOWLEDGE_API_KEY_KEY)
  })

  it('falls back to the openai provider key so existing installs keep working', async () => {
    getConfigValue.mockResolvedValue(null)
    getOpenAIApiKey.mockResolvedValue('sk-provider')

    expect(await getKnowledgeApiKey()).toBe('sk-provider')
  })

  it('returns null when neither key is set', async () => {
    expect(await getKnowledgeApiKey()).toBeNull()
  })
})

describe('getOwnApiKey', () => {
  it('reports only the knowledge key, never the provider fallback', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-provider')
    expect(await getOwnApiKey()).toBeNull()

    _resetKnowledgeSettingsCacheForTests()
    getConfigValue.mockResolvedValue('sk-knowledge')
    expect(await getOwnApiKey()).toBe('sk-knowledge')
  })

  it('invalidates the cache when the key is saved', async () => {
    getConfigValue.mockResolvedValue('sk-old')
    expect(await getOwnApiKey()).toBe('sk-old')

    getConfigValue.mockResolvedValue('sk-new')
    await setKnowledgeApiKey('sk-new')

    expect(await getOwnApiKey()).toBe('sk-new')
    expect(setConfigValue).toHaveBeenCalledWith(KNOWLEDGE_API_KEY_KEY, 'sk-new')
  })
})

describe('getVectorStoreId', () => {
  it('returns the stored id or null when unset', async () => {
    getConfigValue.mockResolvedValue('vs_123')
    expect(await getVectorStoreId()).toBe('vs_123')
    expect(getConfigValue).toHaveBeenCalledWith(KNOWLEDGE_VECTOR_STORE_KEY)

    _resetKnowledgeSettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getVectorStoreId()).toBeNull()
  })

  it('saves the id and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue('vs_old')
    expect(await getVectorStoreId()).toBe('vs_old')

    getConfigValue.mockResolvedValue('vs_new')
    await setVectorStoreId('vs_new')

    expect(await getVectorStoreId()).toBe('vs_new')
    expect(setConfigValue).toHaveBeenCalledWith(KNOWLEDGE_VECTOR_STORE_KEY, 'vs_new')
  })
})

describe('isKnowledgeConfigured', () => {
  it('needs both a key and a vector store', async () => {
    getConfigValue.mockImplementation(async key => (key === KNOWLEDGE_VECTOR_STORE_KEY ? 'vs_123' : null))
    getOpenAIApiKey.mockResolvedValue('sk-provider')
    expect(await isKnowledgeConfigured()).toBe(true)

    _resetKnowledgeSettingsCacheForTests()
    getOpenAIApiKey.mockResolvedValue(null)
    expect(await isKnowledgeConfigured()).toBe(false)

    _resetKnowledgeSettingsCacheForTests()
    getConfigValue.mockResolvedValue(null)
    getOpenAIApiKey.mockResolvedValue('sk-provider')
    expect(await isKnowledgeConfigured()).toBe(false)
  })

  it('stays configured under a non-openai chat provider', async () => {
    getConfigValue.mockImplementation(async key => (key === KNOWLEDGE_VECTOR_STORE_KEY ? 'vs_123' : 'sk-knowledge-own'))

    expect(await isKnowledgeConfigured()).toBe(true)
    expect(getOpenAIApiKey).not.toHaveBeenCalled()
  })
})
