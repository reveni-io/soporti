import OpenAI from 'openai'
import { setDefaultOpenAIClient } from '@openai/agents'
import { getOpenAIApiKey, getOpenAIModel } from './settings.js'

let clientInstance = null
let clientInstanceKey = null

export async function getOpenAIClient() {
  const key = await getOpenAIApiKey()
  if (!key) return null
  if (!clientInstance || clientInstanceKey !== key) {
    clientInstance = new OpenAI({ apiKey: key })
    clientInstanceKey = key
    setDefaultOpenAIClient(clientInstance)
  }
  return clientInstance
}

export async function resolveModelForAgent() {
  const client = await getOpenAIClient()
  if (!client) {
    throw new Error('OpenAI API key not configured. Set it in the admin panel (OpenAI section).')
  }
  const model = await getOpenAIModel()
  if (!model) {
    throw new Error('OpenAI model not configured. Set it in the admin panel (OpenAI section).')
  }
  return model
}

const CODEX_MODELS = /codex/i

export function codexModelSettings(model) {
  return CODEX_MODELS.test(model) ? { reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } } : null
}

export function _resetClientForTests() {
  clientInstance = null
  clientInstanceKey = null
}
