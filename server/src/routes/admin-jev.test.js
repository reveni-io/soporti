import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const listModels = vi.fn()
vi.mock('../jev/client.js', async importOriginal => ({ ...(await importOriginal()), listModels }))

const { JevApiError } = await import('../jev/client.js')
const { JEV_API_KEY_KEY, JEV_MODEL_CATALOG_KEY, _resetJevSettingsCacheForTests } = await import('../jev/settings.js')
const { default: adminJevRouter } = await import('./admin-jev.js')

const app = express()
app.use(express.json())
app.use('/api/admin/config/jev', adminJevRouter)

const LATEST = { name: 'jev-latest', description: 'Most recent stable release', releaseDate: '2026-10-14' }
const PREVIEW = { name: 'jev-preview', description: 'Most recent release', releaseDate: '2026-10-14' }

let stored = {}

beforeEach(() => {
  vi.clearAllMocks()
  _resetJevSettingsCacheForTests()
  stored = {}
  getConfigValue.mockImplementation(async key => stored[key] ?? null)
  setConfigValue.mockImplementation(async (key, value) => {
    stored[key] = value
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/admin/config/jev', () => {
  it('reports no key and an empty catalog by default', async () => {
    const res = await request(app).get('/api/admin/config/jev')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ keyConfigured: false, models: [], scannedAt: null })
  })

  it('reports the key as configured without returning it, with the saved catalog', async () => {
    stored[JEV_API_KEY_KEY] = 'jev-secret'
    stored[JEV_MODEL_CATALOG_KEY] = { models: [LATEST], scannedAt: '2026-11-17T08:30:00.000Z' }

    const res = await request(app).get('/api/admin/config/jev')

    expect(res.body).toEqual({ keyConfigured: true, models: [LATEST], scannedAt: '2026-11-17T08:30:00.000Z' })
    expect(JSON.stringify(res.body)).not.toContain('jev-secret')
  })

  it('returns 500 when the settings cannot be read', async () => {
    getConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/jev')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the Jev settings.' })
  })
})

describe('PUT /api/admin/config/jev/api-key', () => {
  it('saves a trimmed key', async () => {
    const res = await request(app).put('/api/admin/config/jev/api-key').send({ apiKey: '  jev-secret  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ keyConfigured: true })
    expect(setConfigValue).toHaveBeenCalledWith(JEV_API_KEY_KEY, 'jev-secret')
  })

  it('removes the key with an empty value', async () => {
    stored[JEV_API_KEY_KEY] = 'jev-secret'

    const res = await request(app).put('/api/admin/config/jev/api-key').send({ apiKey: '' })

    expect(res.body).toEqual({ keyConfigured: false })
    expect(stored[JEV_API_KEY_KEY]).toBe('')
  })

  it.each([[{}], [{ apiKey: 'two words' }], [{ apiKey: 'k'.repeat(301) }]])('rejects %j', async body => {
    const res = await request(app).put('/api/admin/config/jev/api-key').send(body)

    expect(res.status).toBe(400)
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('returns 500 when the key cannot be saved', async () => {
    setConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).put('/api/admin/config/jev/api-key').send({ apiKey: 'jev-secret' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the Jev API key.' })
  })
})

describe('POST /api/admin/config/jev/test', () => {
  it('asks for the key first when none is saved', async () => {
    const res = await request(app).post('/api/admin/config/jev/test')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'No API key saved. Save the key above and test again.' })
    expect(listModels).not.toHaveBeenCalled()
  })

  it('reports the latency of a successful call', async () => {
    stored[JEV_API_KEY_KEY] = 'jev-secret'
    listModels.mockResolvedValue([LATEST])

    const res = await request(app).post('/api/admin/config/jev/test')

    expect(res.status).toBe(200)
    expect(res.body.latencyMs).toEqual(expect.any(Number))
    expect(listModels).toHaveBeenCalledTimes(1)
  })

  it('hides unexpected errors', async () => {
    stored[JEV_API_KEY_KEY] = 'jev-secret'
    listModels.mockRejectedValue(new Error('boom'))

    const res = await request(app).post('/api/admin/config/jev/test')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to test the Jev connection.' })
  })
})

describe('POST /api/admin/config/jev/models/scan', () => {
  it('asks for the key first when none is saved', async () => {
    const res = await request(app).post('/api/admin/config/jev/models/scan')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'No API key saved. Save the key above and scan again.' })
  })

  it('saves the scanned models and counts the new ones', async () => {
    stored[JEV_API_KEY_KEY] = 'jev-secret'
    stored[JEV_MODEL_CATALOG_KEY] = { models: [LATEST], scannedAt: '2026-11-01T08:00:00.000Z' }
    listModels.mockResolvedValue([LATEST, PREVIEW])

    const res = await request(app).post('/api/admin/config/jev/models/scan')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ models: [LATEST, PREVIEW], scannedAt: expect.any(String), newModels: 1 })
    expect(stored[JEV_MODEL_CATALOG_KEY]).toEqual({ models: [LATEST, PREVIEW], scannedAt: res.body.scannedAt })
  })

  it('keeps the saved list when Jev fails', async () => {
    const saved = { models: [LATEST], scannedAt: '2026-11-01T08:00:00.000Z' }
    stored[JEV_API_KEY_KEY] = 'jev-secret'
    stored[JEV_MODEL_CATALOG_KEY] = saved
    listModels.mockRejectedValue(new JevApiError('Jev error (HTTP 529)', 529))

    const res = await request(app).post('/api/admin/config/jev/models/scan')

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Could not scan the Jev models: Jev error (HTTP 529).' })
    expect(stored[JEV_MODEL_CATALOG_KEY]).toBe(saved)
  })
})
