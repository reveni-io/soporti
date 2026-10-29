import { createAnthropic } from '@ai-sdk/anthropic'
import { aisdk } from '@openai/agents-extensions/ai-sdk'
import { getAnthropicApiKey, getAnthropicModel } from './settings.js'
import { WRITE_TOOL_NAMES } from '../agent/sources.js'

export const id = 'anthropic'
export const label = 'Anthropic'
export const continuationToken = false

const MAX_RETRIES = 2
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529])
const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
const CLEAR_TOOL_RESULTS_TRIGGER_TOKENS = 600_000
const KEPT_TOOL_USES = 10
const MIN_CLEARED_TOKENS = 100_000
const CONTEXT_MANAGEMENT = {
  edits: [
    {
      type: 'clear_tool_uses_20250919',
      trigger: { type: 'input_tokens', value: CLEAR_TOOL_RESULTS_TRIGGER_TOKENS },
      keep: { type: 'tool_uses', value: KEPT_TOOL_USES },
      clearAtLeast: { type: 'input_tokens', value: MIN_CLEARED_TOKENS },
      excludeTools: WRITE_TOOL_NAMES,
    },
  ],
}

export async function isConfigured({ modelId = null } = {}) {
  const [key, model] = await Promise.all([getAnthropicApiKey(), modelId ?? getAnthropicModel()])
  return Boolean(key && model)
}

export async function buildModel({ modelId: override = null } = {}) {
  const key = await getAnthropicApiKey()
  if (!key) {
    throw new Error('Anthropic API key not configured. Set it in the admin panel (LLM section).')
  }

  const modelId = override ?? (await getAnthropicModel())
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

export function modelSettings(_modelId, { effort } = {}) {
  const anthropicOptions = {
    thinking: { type: 'adaptive' },
    cacheControl: { type: 'ephemeral' },
    contextManagement: CONTEXT_MANAGEMENT,
  }

  if (EFFORT_LEVELS.has(effort)) anthropicOptions.effort = effort

  return {
    retry: { maxRetries: MAX_RETRIES, policy: retryPolicy },
    providerData: { providerOptions: { anthropic: anthropicOptions } },
  }
}

export function finalAnswerSettings() {
  return {}
}

export function wrapSession(underlyingSession) {
  return underlyingSession
}
