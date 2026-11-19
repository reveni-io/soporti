import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const listModels = vi.fn()
vi.mock('../jev/client.js', async importOriginal => ({ ...(await importOriginal()), listModels }))

const getJevDocument = vi.fn()
const getLatestJevSave = vi.fn()
const saveJevDocument = vi.fn()
const addJevHistoryEntry = vi.fn()
const listJevHistory = vi.fn()
vi.mock('../db/jev-documents.js', () => ({
  getJevDocument,
  getLatestJevSave,
  saveJevDocument,
  addJevHistoryEntry,
  listJevHistory,
}))

const countJevCallsByProjectSince = vi.fn()
vi.mock('../db/jev-calls.js', () => ({ countJevCallsByProjectSince }))

const { JevApiError } = await import('../jev/client.js')
const { JEV_API_KEY_KEY, JEV_MODEL_CATALOG_KEY, _resetJevSettingsCacheForTests } = await import('../jev/settings.js')
const { default: adminJevRouter } = await import('./admin-jev.js')

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { id: 1, email: 'ana@example.com', role: 'admin' }
  next()
})
app.use('/api/admin/config/jev', adminJevRouter)

const LATEST = { name: 'jev-latest', description: 'Most recent stable release', releaseDate: '2026-10-14' }
const PREVIEW = { name: 'jev-preview', description: 'Most recent release', releaseDate: '2026-10-14' }
const SAVED_AT = '2026-11-19T10:00:00.000Z'
const LEGAL_SET = {
  description: '',
  model: 'jev-latest',
  minConfidence: 0.75,
  timeoutSeconds: 30,
  dailyLimit: 0,
  questions: [{ id: 'q1', type: 'noul', text: 'The reply promises a refund', flagAt: 60 }],
}

let stored = {}

beforeEach(() => {
  vi.clearAllMocks()
  _resetJevSettingsCacheForTests()
  stored = {}
  getConfigValue.mockImplementation(async key => stored[key] ?? null)
  setConfigValue.mockImplementation(async (key, value) => {
    stored[key] = value
  })
  getJevDocument.mockResolvedValue({ id: 'jev', rev: 1, data: { enabled: true }, setVersion: 0 })
  getLatestJevSave.mockResolvedValue(null)
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
  it('saves a trimmed key and records it in the change history', async () => {
    const res = await request(app).put('/api/admin/config/jev/api-key').send({ apiKey: '  jev-secret  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ keyConfigured: true })
    expect(setConfigValue).toHaveBeenCalledWith(JEV_API_KEY_KEY, 'jev-secret')
    expect(addJevHistoryEntry).toHaveBeenCalledTimes(1)
    expect(addJevHistoryEntry).toHaveBeenCalledWith('jev', { author: 'ana@example.com', change: 'API key saved' })
  })

  it('records a replaced key', async () => {
    stored[JEV_API_KEY_KEY] = 'jev-old'

    await request(app).put('/api/admin/config/jev/api-key').send({ apiKey: 'jev-new' })

    expect(addJevHistoryEntry).toHaveBeenCalledWith('jev', { author: 'ana@example.com', change: 'API key replaced' })
  })

  it('removes the key with an empty value', async () => {
    stored[JEV_API_KEY_KEY] = 'jev-secret'

    const res = await request(app).put('/api/admin/config/jev/api-key').send({ apiKey: '' })

    expect(res.body).toEqual({ keyConfigured: false })
    expect(stored[JEV_API_KEY_KEY]).toBe('')
    expect(addJevHistoryEntry).toHaveBeenCalledWith('jev', { author: 'ana@example.com', change: 'API key removed' })
  })

  it('records nothing when removing a key that was not saved', async () => {
    await request(app).put('/api/admin/config/jev/api-key').send({ apiKey: '' })

    expect(addJevHistoryEntry).not.toHaveBeenCalled()
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

  it('asks to turn the Jev calls on before testing', async () => {
    stored[JEV_API_KEY_KEY] = 'jev-secret'
    getJevDocument.mockResolvedValue(null)

    const res = await request(app).post('/api/admin/config/jev/test')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'Jev calls are off. Turn them on and save before testing.' })
    expect(getJevDocument).toHaveBeenCalledWith('jev')
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

describe('GET /api/admin/config/jev/documents/:id', () => {
  it('returns the defaults before the first save', async () => {
    getJevDocument.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/jev/documents/legal')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: 'legal',
      rev: 0,
      data: { set: { ...LEGAL_SET, model: '', minConfidence: null, questions: [] } },
      setVersion: 0,
      savedAt: null,
      savedBy: null,
    })
  })

  it('returns the saved document with its last save', async () => {
    getJevDocument.mockResolvedValue({ id: 'legal', rev: 4, data: { set: LEGAL_SET }, setVersion: 2 })
    getLatestJevSave.mockResolvedValue({ at: SAVED_AT, author: 'luis@example.com', change: 'Questions', rev: 4 })

    const res = await request(app).get('/api/admin/config/jev/documents/legal')

    expect(res.body).toEqual({
      id: 'legal',
      rev: 4,
      data: { set: LEGAL_SET },
      setVersion: 2,
      savedAt: SAVED_AT,
      savedBy: 'luis@example.com',
    })
    expect(getJevDocument).toHaveBeenCalledWith('legal')
  })

  it('returns 404 for an unknown document', async () => {
    const res = await request(app).get('/api/admin/config/jev/documents/billing')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Unknown Jev document.' })
    expect(getJevDocument).not.toHaveBeenCalled()
  })

  it('returns 500 when the document cannot be read', async () => {
    getJevDocument.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/jev/documents/jev')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the settings.' })
  })
})

describe('PUT /api/admin/config/jev/documents/:id', () => {
  it('saves the parsed document with the author and plans the change against the stored one', async () => {
    const saved = { id: 'legal', rev: 5, data: { set: LEGAL_SET }, setVersion: 3 }
    saveJevDocument.mockResolvedValue({ conflict: false, document: saved })
    getLatestJevSave.mockResolvedValue({ at: SAVED_AT, author: 'ana@example.com', change: 'Questions', rev: 5 })

    const res = await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 4, data: { set: LEGAL_SET } })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ...saved, savedAt: SAVED_AT, savedBy: 'ana@example.com' })
    expect(saveJevDocument).toHaveBeenCalledTimes(1)
    const [id, options] = saveJevDocument.mock.calls[0]
    expect(id).toBe('legal')
    expect(options).toMatchObject({ expectedRev: 4, author: 'ana@example.com' })
    expect(options.defaults.set.questions).toEqual([])
    const parsedQuestion = { ...LEGAL_SET.questions[0], instructions: '', criteria: '' }
    expect(options.plan({ rev: 4, data: { set: { ...LEGAL_SET, minConfidence: 0.7 } } })).toEqual({
      data: { set: { ...LEGAL_SET, questions: [parsedQuestion] } },
      change: 'Questions; Min confidence 0.7 → 0.75',
      set: { model: 'jev-latest', minConfidence: 0.75, questions: [parsedQuestion] },
    })
  })

  it('returns 409 with who saved the newer version', async () => {
    saveJevDocument.mockResolvedValue({ conflict: true, document: { id: 'jev', rev: 6, data: {}, setVersion: 0 } })
    getLatestJevSave.mockResolvedValue({ at: SAVED_AT, author: 'luis@example.com', change: 'Jev calls off', rev: 6 })

    const res = await request(app)
      .put('/api/admin/config/jev/documents/jev')
      .send({ rev: 5, data: { enabled: true } })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error:
        'luis@example.com saved version 6 while you were editing version 5. Nothing was saved. Reload the latest version and apply your changes again.',
    })
  })

  it.each([
    [{ data: { enabled: true } }, '"rev" must be the version you edited.'],
    [{ rev: 1, data: { enabled: 'on' } }, '"enabled" must be true or false.'],
  ])('rejects %j', async (body, error) => {
    const res = await request(app).put('/api/admin/config/jev/documents/jev').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
    expect(saveJevDocument).not.toHaveBeenCalled()
  })

  it('returns 500 when the document cannot be saved', async () => {
    saveJevDocument.mockRejectedValue(new Error('db down'))

    const res = await request(app)
      .put('/api/admin/config/jev/documents/jev')
      .send({ rev: 1, data: { enabled: true } })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the settings.' })
  })
})

describe('GET /api/admin/config/jev/documents/:id/history', () => {
  it('returns the requested page', async () => {
    const page = { entries: [{ at: SAVED_AT, author: 'ana@example.com', change: 'Jev calls on', rev: 2 }] }
    listJevHistory.mockResolvedValue({ ...page, total: 6, page: 2, pageSize: 5 })

    const res = await request(app).get('/api/admin/config/jev/documents/jev/history?page=2')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ...page, total: 6, page: 2, pageSize: 5 })
    expect(listJevHistory).toHaveBeenCalledWith('jev', 2)
  })

  it('starts at the first page', async () => {
    listJevHistory.mockResolvedValue({ entries: [], total: 0, page: 1, pageSize: 5 })

    await request(app).get('/api/admin/config/jev/documents/legal/history')

    expect(listJevHistory).toHaveBeenCalledWith('legal', 1)
  })

  it('rejects an invalid page', async () => {
    const res = await request(app).get('/api/admin/config/jev/documents/jev/history?page=0')

    expect(res.status).toBe(400)
    expect(listJevHistory).not.toHaveBeenCalled()
  })

  it('returns 500 when the history cannot be read', async () => {
    listJevHistory.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/jev/documents/jev/history')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the change history.' })
  })
})

describe('GET /api/admin/config/jev/usage', () => {
  it('counts the calls of each project in the last 30 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'))
    countJevCallsByProjectSince.mockResolvedValue([{ project: 'legal', calls: 41 }])

    const res = await request(app).get('/api/admin/config/jev/usage')

    vi.useRealTimers()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      projects: [
        { id: 'github', calls: 0 },
        { id: 'legal', calls: 41 },
      ],
    })
    expect(countJevCallsByProjectSince).toHaveBeenCalledWith(new Date('2026-10-20T12:00:00.000Z'))
  })

  it('returns 500 when the usage cannot be read', async () => {
    countJevCallsByProjectSince.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/jev/usage')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the Jev usage.' })
  })
})
