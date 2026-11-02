import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const isProviderConfigured = vi.fn()
vi.mock('../llm/model.js', () => ({ isProviderConfigured }))

const { _resetLlmSettingsCacheForTests } = await import('../llm/settings.js')
const { _resetVideoSettingsCacheForTests } = await import('../video/settings.js')
const { default: adminVideoRouter } = await import('./admin-video.js')

const app = express()
app.use(express.json())
app.use('/api/admin/config/video', adminVideoRouter)

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
]
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

let stored = {}

beforeEach(() => {
  vi.clearAllMocks()
  _resetLlmSettingsCacheForTests()
  _resetVideoSettingsCacheForTests()
  stored = {}
  getConfigValue.mockImplementation(async key => stored[key] ?? null)
  setConfigValue.mockImplementation(async (key, value) => {
    stored[key] = value
  })
  isProviderConfigured.mockImplementation(async (_provider, { model }) => Boolean(model))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/admin/config/video', () => {
  it('reports the defaults while nothing is stored', async () => {
    const res = await request(app).get('/api/admin/config/video')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      provider: 'openai',
      model: '',
      effort: 'max',
      providers: PROVIDERS,
      effortLevels: EFFORT_LEVELS,
      configured: false,
    })
  })

  it('follows the chat provider and reports it configured through its LLM section model', async () => {
    stored = { llm_provider: 'anthropic', anthropic_model: 'claude-opus-5' }

    const res = await request(app).get('/api/admin/config/video')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ provider: 'anthropic', model: '', effort: 'max', configured: true })
    expect(isProviderConfigured).toHaveBeenCalledWith('anthropic', { model: 'claude-opus-5' })
  })

  it('returns the stored video settings', async () => {
    stored = { video_provider: 'openai', video_model: 'gpt-5.2-codex', video_effort: 'xhigh' }

    const res = await request(app).get('/api/admin/config/video')

    expect(res.body).toMatchObject({ provider: 'openai', model: 'gpt-5.2-codex', effort: 'xhigh', configured: true })
  })

  it('returns a generic 500 when the settings cannot be read', async () => {
    getConfigValue.mockRejectedValue(new Error('connection refused'))

    const res = await request(app).get('/api/admin/config/video')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the video settings.' })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('Failed to load the video settings:', expect.any(Error))
  })
})

describe('PUT /api/admin/config/video/provider', () => {
  it('saves the provider and reports whether it is configured', async () => {
    stored = { anthropic_model: 'claude-opus-5' }

    const res = await request(app).put('/api/admin/config/video/provider').send({ provider: 'anthropic' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ provider: 'anthropic', configured: true })
    expect(stored.video_provider).toBe('anthropic')
  })

  it('rejects an unknown provider with 400 without saving', async () => {
    const res = await request(app).put('/api/admin/config/video/provider').send({ provider: 'gemini' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'That is not a supported LLM provider.' })
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('returns a generic 500 when the save fails', async () => {
    setConfigValue.mockRejectedValue(new Error('connection refused'))

    const res = await request(app).put('/api/admin/config/video/provider').send({ provider: 'anthropic' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the video provider.' })
    expect(console.error).toHaveBeenCalledWith('Failed to save the video provider:', expect.any(Error))
  })
})

describe('PUT /api/admin/config/video/model', () => {
  it('saves the trimmed model', async () => {
    const res = await request(app).put('/api/admin/config/video/model').send({ model: ' gpt-5.2-codex ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ model: 'gpt-5.2-codex', configured: true })
    expect(stored.video_model).toBe('gpt-5.2-codex')
  })

  it('clears the model with an empty value so the LLM section model applies again', async () => {
    stored = { video_model: 'gpt-5.2-codex' }

    const res = await request(app).put('/api/admin/config/video/model').send({ model: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ model: '', configured: false })
    expect(setConfigValue).toHaveBeenCalledTimes(1)
    expect(setConfigValue).toHaveBeenCalledWith('video_model', '')
  })

  it('rejects a model id with spaces with 400', async () => {
    const res = await request(app).put('/api/admin/config/video/model').send({ model: 'gpt 5' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'The model must be a single id without spaces, up to 100 characters.' })
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('rejects a missing model with 400', async () => {
    const res = await request(app).put('/api/admin/config/video/model').send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'The model must be a string (empty to use the LLM section model).' })
  })
})

describe('PUT /api/admin/config/video/effort', () => {
  it('saves an extended effort level', async () => {
    const res = await request(app).put('/api/admin/config/video/effort').send({ effort: 'xhigh' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ effort: 'xhigh', configured: false })
    expect(stored.video_effort).toBe('xhigh')
  })

  it('rejects an unsupported effort with 400 without saving', async () => {
    const res = await request(app).put('/api/admin/config/video/effort').send({ effort: 'extreme' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'That is not a supported reasoning effort.' })
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('returns a generic 500 when the save fails', async () => {
    setConfigValue.mockRejectedValue(new Error('connection refused'))

    const res = await request(app).put('/api/admin/config/video/effort').send({ effort: 'high' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the video reasoning effort.' })
    expect(console.error).toHaveBeenCalledWith('Failed to save the video reasoning effort:', expect.any(Error))
  })
})
