import { getConfigValue, setConfigValue } from '../db/app-config.js'
import { getOpenAIApiKey } from '../llm/settings.js'

export const KNOWLEDGE_API_KEY_KEY = 'knowledge_openai_api_key'
export const KNOWLEDGE_VECTOR_STORE_KEY = 'openai_vector_store_id'

const CACHE_TTL_MS = 60_000
const cache = new Map()

async function getCachedValue(key) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }

  const stored = await getConfigValue(key)
  const value = typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export async function getOwnApiKey() {
  return getCachedValue(KNOWLEDGE_API_KEY_KEY)
}

export async function getKnowledgeApiKey() {
  const own = await getOwnApiKey()
  return own ?? getOpenAIApiKey()
}

export async function setKnowledgeApiKey(apiKey) {
  await setConfigValue(KNOWLEDGE_API_KEY_KEY, apiKey)
  cache.delete(KNOWLEDGE_API_KEY_KEY)
}

export async function getVectorStoreId() {
  return getCachedValue(KNOWLEDGE_VECTOR_STORE_KEY)
}

export async function setVectorStoreId(vectorStoreId) {
  await setConfigValue(KNOWLEDGE_VECTOR_STORE_KEY, vectorStoreId)
  cache.delete(KNOWLEDGE_VECTOR_STORE_KEY)
}

export async function isKnowledgeConfigured() {
  const [apiKey, vectorStoreId] = await Promise.all([getKnowledgeApiKey(), getVectorStoreId()])
  return Boolean(apiKey && vectorStoreId)
}

export function _resetKnowledgeSettingsCacheForTests() {
  cache.clear()
}
