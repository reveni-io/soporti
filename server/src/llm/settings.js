import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const LLM_PROVIDER_KEY = 'llm_provider'
export const OPENAI_API_KEY_KEY = 'openai_api_key'
export const OPENAI_MODEL_KEY = 'openai_model'
export const ANTHROPIC_API_KEY_KEY = 'anthropic_api_key'
export const ANTHROPIC_MODEL_KEY = 'anthropic_model'

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

async function setValue(key, value) {
  await setConfigValue(key, value)
  cache.delete(key)
}

export async function getLlmProvider() {
  return getCachedValue(LLM_PROVIDER_KEY)
}

export async function setLlmProvider(provider) {
  await setValue(LLM_PROVIDER_KEY, provider)
}

export async function getOpenAIApiKey() {
  return getCachedValue(OPENAI_API_KEY_KEY)
}

export async function setOpenAIApiKey(apiKey) {
  await setValue(OPENAI_API_KEY_KEY, apiKey)
}

export async function getOpenAIModel() {
  return getCachedValue(OPENAI_MODEL_KEY)
}

export async function setOpenAIModel(model) {
  await setValue(OPENAI_MODEL_KEY, model)
}

export async function getAnthropicApiKey() {
  return getCachedValue(ANTHROPIC_API_KEY_KEY)
}

export async function setAnthropicApiKey(apiKey) {
  await setValue(ANTHROPIC_API_KEY_KEY, apiKey)
}

export async function getAnthropicModel() {
  return getCachedValue(ANTHROPIC_MODEL_KEY)
}

export async function setAnthropicModel(model) {
  await setValue(ANTHROPIC_MODEL_KEY, model)
}

export function _resetLlmSettingsCacheForTests() {
  cache.clear()
}
