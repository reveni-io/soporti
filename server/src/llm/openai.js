import OpenAI from 'openai'
import { OpenAIResponsesCompactionSession, setDefaultOpenAIClient } from '@openai/agents'
import { getOpenAIApiKey, getOpenAIModel } from './settings.js'

export const id = 'openai'
export const label = 'OpenAI'
export const continuationToken = true

const CODEX_MODELS = /codex/i
const REASONING_MODELS = /^(gpt-5|o\d)/i
const CODEX_VERBOSITY = 'medium'

let clientInstance = null
let clientInstanceKey = null

async function getClient() {
  const key = await getOpenAIApiKey()
  if (!key) return null

  if (!clientInstance || clientInstanceKey !== key) {
    clientInstance = new OpenAI({ apiKey: key })
    clientInstanceKey = key
    setDefaultOpenAIClient(clientInstance)
  }
  return clientInstance
}

export async function isConfigured() {
  const [key, model] = await Promise.all([getOpenAIApiKey(), getOpenAIModel()])
  return Boolean(key && model)
}

export async function buildModel({ modelId: override = null } = {}) {
  const client = await getClient()
  if (!client) {
    throw new Error('OpenAI API key not configured. Set it in the admin panel (LLM section).')
  }

  const modelId = override ?? (await getOpenAIModel())
  if (!modelId) {
    throw new Error('OpenAI model not configured. Set it in the admin panel (LLM section).')
  }

  return { modelId, model: modelId }
}

export function modelSettings(modelId, { effort } = {}) {
  if (!effort) return {}
  if (CODEX_MODELS.test(modelId)) return { reasoning: { effort }, text: { verbosity: CODEX_VERBOSITY } }
  if (!REASONING_MODELS.test(modelId)) return {}

  return { reasoning: { effort } }
}

export async function wrapSession(underlyingSession) {
  const client = await getClient()
  if (!client) return underlyingSession

  return new OpenAIResponsesCompactionSession({ underlyingSession, client })
}

export function _resetOpenAIClientForTests() {
  clientInstance = null
  clientInstanceKey = null
}
