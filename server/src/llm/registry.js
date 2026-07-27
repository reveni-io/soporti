import * as anthropic from './anthropic.js'
import * as openai from './openai.js'

export const DEFAULT_PROVIDER = openai.id

const PROVIDERS = new Map([
  [openai.id, openai],
  [anthropic.id, anthropic],
])

export function listProviders() {
  return [...PROVIDERS.values()].map(provider => ({ id: provider.id, label: provider.label }))
}

export function isKnownProvider(id) {
  return PROVIDERS.has(id)
}

export function getProvider(id) {
  return PROVIDERS.get(id) ?? PROVIDERS.get(DEFAULT_PROVIDER)
}
