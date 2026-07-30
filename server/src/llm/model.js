import { setTracingDisabled } from '@openai/agents'
import { getProvider } from './registry.js'
import { getLlmProvider, getReasoningEffort } from './settings.js'
import { DEFAULT_REASONING_EFFORT, REASONING_EFFORT_LEVELS } from '../constants.js'

setTracingDisabled(true)

async function resolveProvider() {
  return getProvider(await getLlmProvider())
}

async function resolveEffort() {
  const stored = await getReasoningEffort()
  return REASONING_EFFORT_LEVELS.includes(stored) ? stored : DEFAULT_REASONING_EFFORT
}

export async function describeProvider() {
  const provider = await resolveProvider()
  return { label: provider.label, configured: await provider.isConfigured() }
}

export async function isConfigured() {
  const provider = await resolveProvider()
  return provider.isConfigured()
}

export async function resolveModelForAgent() {
  const provider = await resolveProvider()
  const [{ modelId, model }, effort] = await Promise.all([provider.buildModel(), resolveEffort()])

  return { model, modelSettings: provider.modelSettings(modelId, { effort }) }
}

export async function wrapSession(underlyingSession) {
  const provider = await resolveProvider()
  return provider.wrapSession(underlyingSession)
}

export async function usesContinuationToken() {
  const provider = await resolveProvider()
  return provider.continuationToken
}
