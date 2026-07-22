import { describe, it, expect, vi, beforeEach } from 'vitest'

const setDefaultOpenAIClient = vi.fn()
vi.mock('@openai/agents', () => ({ setDefaultOpenAIClient }))

// Each OpenAI(...) instance is tagged with the key it was built with so the
// test can assert caching/rebuild behaviour.
const openaiConstructor = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    constructor(opts) {
      openaiConstructor(opts)
      this.apiKey = opts.apiKey
    }
  },
}))

const getOpenAIApiKey = vi.fn()
const getOpenAIModel = vi.fn()
vi.mock('./settings.js', () => ({ getOpenAIApiKey, getOpenAIModel }))

const { getOpenAIClient, resolveModelForAgent, codexModelSettings, _resetClientForTests } = await import('./client.js')

beforeEach(() => {
  setDefaultOpenAIClient.mockReset()
  openaiConstructor.mockReset()
  getOpenAIApiKey.mockReset()
  getOpenAIModel.mockReset()
  _resetClientForTests()
})

describe('getOpenAIClient', () => {
  it('returns null when no key is configured', async () => {
    getOpenAIApiKey.mockResolvedValue(null)
    expect(await getOpenAIClient()).toBeNull()
    expect(openaiConstructor).not.toHaveBeenCalled()
    expect(setDefaultOpenAIClient).not.toHaveBeenCalled()
  })

  it('builds the client from the stored key and registers it as the Agents default', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    const client = await getOpenAIClient()
    expect(client.apiKey).toBe('sk-abc')
    expect(openaiConstructor).toHaveBeenCalledWith({ apiKey: 'sk-abc' })
    expect(setDefaultOpenAIClient).toHaveBeenCalledWith(client)
  })

  it('memoizes the client while the key is unchanged', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    const a = await getOpenAIClient()
    const b = await getOpenAIClient()
    expect(a).toBe(b)
    expect(openaiConstructor).toHaveBeenCalledTimes(1)
    expect(setDefaultOpenAIClient).toHaveBeenCalledTimes(1)
  })

  it('rebuilds and re-registers when the key changes (rotation)', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-old')
    const first = await getOpenAIClient()

    getOpenAIApiKey.mockResolvedValue('sk-new')
    const second = await getOpenAIClient()

    expect(second).not.toBe(first)
    expect(second.apiKey).toBe('sk-new')
    expect(openaiConstructor).toHaveBeenCalledTimes(2)
    expect(setDefaultOpenAIClient).toHaveBeenLastCalledWith(second)
  })
})

describe('resolveModelForAgent', () => {
  it('returns the configured model and ensures the default client is set', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue('gpt-5.2-codex')

    expect(await resolveModelForAgent()).toBe('gpt-5.2-codex')
    expect(setDefaultOpenAIClient).toHaveBeenCalledTimes(1)
  })

  it('throws a clear error when no key is configured', async () => {
    getOpenAIApiKey.mockResolvedValue(null)
    await expect(resolveModelForAgent()).rejects.toThrow(/API key not configured/i)
  })

  it('throws a clear error when the model is not configured (no default)', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-abc')
    getOpenAIModel.mockResolvedValue(null)
    await expect(resolveModelForAgent()).rejects.toThrow(/model not configured/i)
  })
})

describe('codexModelSettings', () => {
  it('forces reasoning and verbosity to medium for codex models', () => {
    expect(codexModelSettings('gpt-5.2-codex')).toEqual({
      reasoning: { effort: 'medium' },
      text: { verbosity: 'medium' },
    })
    expect(codexModelSettings('gpt-5-codex')).toEqual({
      reasoning: { effort: 'medium' },
      text: { verbosity: 'medium' },
    })
  })

  it('returns null for non-codex models so the SDK defaults stay in place', () => {
    expect(codexModelSettings('gpt-5.2')).toBeNull()
    expect(codexModelSettings('gpt-4o')).toBeNull()
    expect(codexModelSettings('o3')).toBeNull()
  })
})
