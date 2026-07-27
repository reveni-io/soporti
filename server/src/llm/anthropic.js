import { createAnthropic } from '@ai-sdk/anthropic'
import { aisdk } from '@openai/agents-extensions/ai-sdk'
import config from '../config.js'
import { getAnthropicApiKey, getAnthropicModel } from './settings.js'

export const id = 'anthropic'
export const label = 'Anthropic'
export const continuationToken = false

const MAX_RETRIES = 2
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529])
const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

export async function isConfigured() {
  const [key, model] = await Promise.all([getAnthropicApiKey(), getAnthropicModel()])
  return Boolean(key && model)
}

export async function buildModel() {
  const key = await getAnthropicApiKey()
  if (!key) {
    throw new Error('Anthropic API key not configured. Set it in the admin panel (LLM section).')
  }

  const modelId = await getAnthropicModel()
  if (!modelId) {
    throw new Error('Anthropic model not configured. Set it in the admin panel (LLM section).')
  }

  return { modelId, model: aisdk(createAnthropic({ apiKey: key })(modelId)) }
}

export function retryPolicy({ normalized }) {
  if (normalized.isAbort) return false
  if (normalized.isNetworkError) return true

  return normalized.statusCode !== undefined && RETRYABLE_STATUS.has(normalized.statusCode)
}

function reviewEffort() {
  const effort = config.review.reasoningEffort
  return EFFORT_LEVELS.has(effort) ? effort : null
}

export function modelSettings(_modelId, { intent = 'chat' } = {}) {
  const anthropicOptions = { thinking: { type: 'adaptive' } }

  const effort = intent === 'review' ? reviewEffort() : null
  if (effort) anthropicOptions.effort = effort

  return {
    retry: { maxRetries: MAX_RETRIES, policy: retryPolicy },
    providerData: { providerOptions: { anthropic: anthropicOptions } },
  }
}

export function wrapSession(underlyingSession) {
  return underlyingSession
}
