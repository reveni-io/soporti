import { getConfigValue, setConfigValue } from '../db/app-config.js'

// OpenAI runtime settings, stored in the database (app_config) and edited from
// the admin panel (OpenAI section) — no env vars. The database is the single
// source of truth. The API key is read on every agent run and vector-store
// call, so values are cached briefly; saves invalidate the cache immediately in
// this process, the TTL covers other instances.

export const OPENAI_API_KEY_KEY = 'openai_api_key'
export const OPENAI_MODEL_KEY = 'openai_model'
export const OPENAI_VECTOR_STORE_KEY = 'openai_vector_store_id'

const CACHE_TTL_MS = 60_000
const cache = new Map() // key -> { value, expiresAt }

async function getCachedValue(key) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }
  const value = await getConfigValue(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

// Returns the API key or null when not configured.
export async function getOpenAIApiKey() {
  const stored = await getCachedValue(OPENAI_API_KEY_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

// An empty string clears the key (the assistant is disabled until one is set).
export async function setOpenAIApiKey(apiKey) {
  await setConfigValue(OPENAI_API_KEY_KEY, apiKey)
  cache.delete(OPENAI_API_KEY_KEY)
}

// Returns the configured model, or null when unset/empty. There is no default:
// the model must be set explicitly in the admin panel (like the API key), so a
// fresh install runs no model until an operator picks one.
export async function getOpenAIModel() {
  const stored = await getCachedValue(OPENAI_MODEL_KEY)
  return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null
}

// An empty string clears the model (the assistant is disabled until one is set).
export async function setOpenAIModel(model) {
  await setConfigValue(OPENAI_MODEL_KEY, model)
  cache.delete(OPENAI_MODEL_KEY)
}

// Vector store used for the knowledge base (similar cases). Null when not
// configured — knowledge features degrade gracefully.
export async function getVectorStoreId() {
  const stored = await getCachedValue(OPENAI_VECTOR_STORE_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

// An empty string clears the vector store (knowledge features disabled).
export async function setVectorStoreId(vectorStoreId) {
  await setConfigValue(OPENAI_VECTOR_STORE_KEY, vectorStoreId)
  cache.delete(OPENAI_VECTOR_STORE_KEY)
}

// Test-only: clear the cache between tests.
export function _resetSettingsCacheForTests() {
  cache.clear()
}
