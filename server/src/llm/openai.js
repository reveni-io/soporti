import OpenAI from 'openai'
import { OpenAIResponsesCompactionSession, setDefaultOpenAIClient } from '@openai/agents'
import config from '../config.js'
import { getOpenAIApiKey, getOpenAIModel } from './settings.js'

export const id = 'openai'
export const label = 'OpenAI'
export const continuationToken = true

const CODEX_MODELS = /codex/i
const REASONING_MODELS = /^(gpt-5|o\d)/i
const CODEX_SETTINGS = { reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } }

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

export async function buildModel() {
  const client = await getClient()
  if (!client) {
    throw new Error('OpenAI API key not configured. Set it in the admin panel (LLM section).')
  }

  const modelId = await getOpenAIModel()
  if (!modelId) {
    throw new Error('OpenAI model not configured. Set it in the admin panel (LLM section).')
  }

  return { modelId, model: modelId }
}

export function modelSettings(modelId, { intent = 'chat' } = {}) {
  if (CODEX_MODELS.test(modelId)) return CODEX_SETTINGS
  if (intent !== 'review') return {}

  const effort = config.review.reasoningEffort
  if (!effort || effort === 'none' || !REASONING_MODELS.test(modelId)) return {}

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
