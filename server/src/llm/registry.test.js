import { describe, it, expect, vi } from 'vitest'

vi.mock('@openai/agents', () => ({ setDefaultOpenAIClient: vi.fn(), OpenAIResponsesCompactionSession: class {} }))
vi.mock('openai', () => ({ default: class {} }))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn() }))
vi.mock('@openai/agents-extensions/ai-sdk', () => ({ aisdk: vi.fn() }))

const { DEFAULT_PROVIDER, getProvider, isKnownProvider, listProviders } = await import('./registry.js')

describe('listProviders', () => {
  it('exposes every registered provider as an id and a label', () => {
    expect(listProviders()).toEqual([
      { id: 'openai', label: 'OpenAI' },
      { id: 'anthropic', label: 'Anthropic' },
    ])
  })
})

describe('isKnownProvider', () => {
  it('accepts the registered ids and rejects anything else', () => {
    expect(isKnownProvider('openai')).toBe(true)
    expect(isKnownProvider('anthropic')).toBe(true)
    expect(isKnownProvider('gemini')).toBe(false)
    expect(isKnownProvider(null)).toBe(false)
    expect(isKnownProvider(undefined)).toBe(false)
  })
})

describe('getProvider', () => {
  it('returns the module matching the id', () => {
    expect(getProvider('openai').id).toBe('openai')
    expect(getProvider('anthropic').id).toBe('anthropic')
  })

  it('falls back to the default provider for an unknown id', () => {
    expect(DEFAULT_PROVIDER).toBe('openai')
    expect(getProvider('gemini').id).toBe('openai')
    expect(getProvider(null).id).toBe('openai')
  })
})

describe('the provider contract', () => {
  it('is implemented in full by every registered provider', () => {
    for (const { id } of listProviders()) {
      const provider = getProvider(id)

      expect(typeof provider.isConfigured).toBe('function')
      expect(typeof provider.buildModel).toBe('function')
      expect(typeof provider.modelSettings).toBe('function')
      expect(typeof provider.wrapSession).toBe('function')
      expect(typeof provider.continuationToken).toBe('boolean')
      expect(typeof provider.label).toBe('string')
    }
  })
})
