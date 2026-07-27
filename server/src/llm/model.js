import { setTracingDisabled } from '@openai/agents'
import { getProvider } from './registry.js'
import { getLlmProvider } from './settings.js'

setTracingDisabled(true)

async function resolveProvider() {
  return getProvider(await getLlmProvider())
}

export async function describeProvider() {
  const provider = await resolveProvider()
  return { label: provider.label, configured: await provider.isConfigured() }
}

export async function isConfigured() {
  const provider = await resolveProvider()
  return provider.isConfigured()
}

export async function resolveModelForAgent({ intent = 'chat' } = {}) {
  const provider = await resolveProvider()
  const { modelId, model } = await provider.buildModel()

  return { model, modelSettings: provider.modelSettings(modelId, { intent }) }
}

export async function wrapSession(underlyingSession) {
  const provider = await resolveProvider()
  return provider.wrapSession(underlyingSession)
}

export async function usesContinuationToken() {
  const provider = await resolveProvider()
  return provider.continuationToken
}
