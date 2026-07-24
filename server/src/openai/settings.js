import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const OPENAI_API_KEY_KEY = 'openai_api_key'
export const OPENAI_MODEL_KEY = 'openai_model'
export const OPENAI_VECTOR_STORE_KEY = 'openai_vector_store_id'

const CACHE_TTL_MS = 60_000
const cache = new Map()

async function getCachedValue(key) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }
  const value = await getConfigValue(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export async function getOpenAIApiKey() {
  const stored = await getCachedValue(OPENAI_API_KEY_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function setOpenAIApiKey(apiKey) {
  await setConfigValue(OPENAI_API_KEY_KEY, apiKey)
  cache.delete(OPENAI_API_KEY_KEY)
}

export async function getOpenAIModel() {
  const stored = await getCachedValue(OPENAI_MODEL_KEY)
  return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null
}

export async function setOpenAIModel(model) {
  await setConfigValue(OPENAI_MODEL_KEY, model)
  cache.delete(OPENAI_MODEL_KEY)
}

export async function getVectorStoreId() {
  const stored = await getCachedValue(OPENAI_VECTOR_STORE_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function setVectorStoreId(vectorStoreId) {
  await setConfigValue(OPENAI_VECTOR_STORE_KEY, vectorStoreId)
  cache.delete(OPENAI_VECTOR_STORE_KEY)
}

export function _resetSettingsCacheForTests() {
  cache.clear()
}
