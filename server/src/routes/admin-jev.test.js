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
const listJevSetVersions = vi.fn()
const deleteJevDocument = vi.fn()
vi.mock('../db/jev-documents.js', () => ({
  deleteJevDocument,
  getJevDocument,
  getLatestJevSave,
  saveJevDocument,
  listJevSetVersions,
}))

const countJevCallsByProjectSince = vi.fn()
const countJevCallsBySetVersion = vi.fn()
vi.mock('../db/jev-calls.js', () => ({ countJevCallsByProjectSince, countJevCallsBySetVersion }))

const countCasesByGuardSince = vi.fn()
const countSentRepliesByGuardSince = vi.fn()
vi.mock('../db/legal-cases.js', () => ({ countCasesByGuardSince, countSentRepliesByGuardSince }))

const listGuards = vi.fn()
vi.mock('../guards/registry.js', async importOriginal => ({ ...(await importOriginal()), listGuards }))

const { JEV_API_KEY_KEY, _resetJevSettingsCacheForTests } = await import('../jev/settings.js')
const { default: adminJevRouter } = await import('./admin-jev.js')

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { id: 1, email: 'ana@example.com', role: 'admin' }
  next()
})
app.use('/api/admin/config/jev', adminJevRouter)

const LATEST = { name: 'jev-latest', description: 'Most recent stable release', releaseDate: '2026-10-14' }
const SAVED_AT = '2026-11-19T10:00:00.000Z'
const LEGAL_SET = {
  minConfidence: 0.75,
  timeoutSeconds: 30,
  dailyLimit: 0,
  maxCharacters: 100_000,
  questions: [{ id: 'q1', type: 'noul', text: 'The reply promises a refund', flagAt: 60 }],
}

const LEGAL_GUARD = { id: 'legal', name: 'Legal', questions: 1, setVersion: 3 }
const GITHUB_GUARD = { id: 'github', name: 'GitHub PRs', questions: 0, setVersion: 0 }
const GUARDS = [LEGAL_GUARD, GITHUB_GUARD]

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
  listGuards.mockResolvedValue(GUARDS)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/admin/config/jev', () => {
  it('reports whether a key is saved, without returning it', async () => {
    const none = await request(app).get('/api/admin/config/jev')
    stored[JEV_API_KEY_KEY] = 'jev-secret'
    _resetJevSettingsCacheForTests()
    const saved = await request(app).get('/api/admin/config/jev')

    expect(none.status).toBe(200)
    expect(none.body).toEqual({ keyConfigured: false })
    expect(saved.body).toEqual({ keyConfigured: true })
    expect(JSON.stringify(saved.body)).not.toContain('jev-secret')
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

describe('POST and DELETE /api/admin/config/jev/guards', () => {
  it('creates a guard with its name', async () => {
    saveJevDocument.mockResolvedValue({ conflict: false, document: { id: 'x', rev: 0, data: {}, setVersion: 0 } })

    const res = await request(app).post('/api/admin/config/jev/guards').send({ name: '  Payments ' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: expect.stringMatching(/^guard-[0-9a-f]{8}$/), name: 'Payments' })
    const [id, options] = saveJevDocument.mock.calls[0]
    expect(id).toBe(res.body.id)
    expect(options).toMatchObject({ expectedRev: 0, author: 'ana@example.com' })
    expect(options.defaults).toMatchObject({ name: 'Payments', set: { questions: [] } })
    expect(options.plan()).toBeNull()
  })

  it.each([
    [{}, 400, 'The name is required.'],
    [{ name: 'n'.repeat(61) }, 400, 'The name is too long (max 60 characters).'],
    [{ name: 'legal' }, 409, 'There is already a guard called "legal". Pick another name.'],
  ])('refuses to create the guard %j', async (body, status, error) => {
    const res = await request(app).post('/api/admin/config/jev/guards').send(body)

    expect(res.status).toBe(status)
    expect(res.body).toEqual({ error })
    expect(saveJevDocument).not.toHaveBeenCalled()
  })

  it('refuses to rename a guard to the name of another one', async () => {
    const res = await request(app)
      .put('/api/admin/config/jev/documents/guard-0a1b2c3d')
      .send({ rev: 1, data: { name: 'GitHub PRs', set: LEGAL_SET } })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'There is already a guard called "GitHub PRs". Pick another name.' })
  })

  it('deletes a created guard', async () => {
    getJevDocument.mockResolvedValue({ id: 'guard-0a1b2c3d', rev: 2, data: { name: 'Payments', set: LEGAL_SET } })

    const res = await request(app).delete('/api/admin/config/jev/guards/guard-0a1b2c3d')

    expect(res.status).toBe(204)
    expect(deleteJevDocument).toHaveBeenCalledWith('guard-0a1b2c3d')
  })

  it('cannot delete a built-in guard or one that does not exist', async () => {
    getJevDocument.mockResolvedValue(null)

    const builtIn = await request(app).delete('/api/admin/config/jev/guards/legal')
    const missing = await request(app).delete('/api/admin/config/jev/guards/guard-0a1b2c3d')

    expect(builtIn.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(deleteJevDocument).not.toHaveBeenCalled()
  })

  it('returns 500 when the guard cannot be created or deleted', async () => {
    saveJevDocument.mockRejectedValue(new Error('db down'))
    getJevDocument.mockRejectedValue(new Error('db down'))

    const created = await request(app).post('/api/admin/config/jev/guards').send({ name: 'Payments' })
    const deleted = await request(app).delete('/api/admin/config/jev/guards/guard-0a1b2c3d')

    expect(created.status).toBe(500)
    expect(created.body).toEqual({ error: 'Failed to create the guard.' })
    expect(deleted.status).toBe(500)
    expect(deleted.body).toEqual({ error: 'Failed to delete the guard.' })
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
      data: { set: { ...LEGAL_SET, minConfidence: null, questions: [] } },
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

    const res = await request(app).get('/api/admin/config/jev/documents/legal')

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
    expect(options.plan({ rev: 4, data: { set: { ...LEGAL_SET, minConfidence: 0.7 } } })).toEqual({
      data: { set: LEGAL_SET },
      change: 'Min confidence 0.7 → 0.75',
      set: { minConfidence: 0.75, questions: LEGAL_SET.questions },
    })
  })

  it('has no document for the old shared settings', async () => {
    const save = await request(app)
      .put('/api/admin/config/jev/documents/jev')
      .send({ rev: 1, data: { enabled: true } })

    expect(save.status).toBe(404)
  })

  it('returns 409 with who saved the newer version', async () => {
    saveJevDocument.mockResolvedValue({ conflict: true, document: { id: 'legal', rev: 6, data: {}, setVersion: 0 } })
    getLatestJevSave.mockResolvedValue({ at: SAVED_AT, author: 'luis@example.com', change: 'Jev calls off', rev: 6 })

    const res = await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 5, data: { enabled: true, set: LEGAL_SET } })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error:
        'luis@example.com saved version 6 while you were editing version 5. Nothing was saved. Reload the latest version and apply your changes again.',
    })
  })

  it.each([
    [{ data: { enabled: true } }, '"rev" must be the version you edited.'],
    [{ rev: 1, data: { set: { ...LEGAL_SET, minConfidence: 2 } } }, 'Min confidence must be a number between 0 and 1.'],
  ])('rejects %j', async (body, error) => {
    const res = await request(app).put('/api/admin/config/jev/documents/legal').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
    expect(saveJevDocument).not.toHaveBeenCalled()
  })

  it('returns 500 when the document cannot be saved', async () => {
    saveJevDocument.mockRejectedValue(new Error('db down'))

    const res = await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 1, data: { enabled: true, set: LEGAL_SET } })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the settings.' })
  })
})

describe('GET /api/admin/config/jev/guards', () => {
  it('lists every guard with its calls, cases and sent replies of the last 30 days, shared cases included', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-19T12:00:00.000Z'))
    countJevCallsByProjectSince.mockResolvedValue([{ project: 'legal', calls: 41 }])
    countCasesByGuardSince.mockResolvedValue([
      { guardId: 'legal', cases: 9 },
      { guardId: 'github,legal', cases: 2 },
    ])
    countSentRepliesByGuardSince.mockResolvedValue([{ guardId: 'legal', replies: 4 }])

    const res = await request(app).get('/api/admin/config/jev/guards')

    vi.useRealTimers()
    expect(res.status).toBe(200)
    expect(res.body.guards).toEqual([
      { ...LEGAL_GUARD, usage: { calls: 41, cases: 11, sentReplies: 4 } },
      { ...GITHUB_GUARD, usage: { calls: 0, cases: 2, sentReplies: 0 } },
    ])
    expect(countJevCallsByProjectSince).toHaveBeenCalledWith(new Date('2026-10-20T12:00:00.000Z'))
  })

  it('returns 500 when the guards cannot be read', async () => {
    listGuards.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/jev/guards')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the guards.' })
  })
})

describe('PUT /api/admin/config/jev/documents/:id with only some fields', () => {
  it('saves the fields sent and keeps the rest of the stored document', async () => {
    saveJevDocument.mockResolvedValue({ conflict: false, document: { id: 'legal', rev: 2, data: {}, setVersion: 1 } })

    const res = await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 1, data: { name: 'Customer replies' } })

    expect(res.status).toBe(200)
    const [, options] = saveJevDocument.mock.calls[0]
    const stored = { set: { ...LEGAL_SET, minConfidence: 0.8 } }
    expect(options.plan({ rev: 1, data: stored }).data).toEqual({
      name: 'Customer replies',
      set: stored.set,
    })
  })

  it('checks the fields sent against the stored document', async () => {
    saveJevDocument.mockResolvedValue({ conflict: false, document: { id: 'legal', rev: 2, data: {}, setVersion: 1 } })

    await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 1, data: { name: 'Customer replies' } })

    const [, options] = saveJevDocument.mock.calls[0]
    expect(options.plan({ rev: 1, data: { set: { ...LEGAL_SET, minConfidence: 2 } } })).toEqual({
      error: 'Min confidence must be a number between 0 and 1.',
    })
  })

  it('rejects data that is not an object', async () => {
    const res = await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 1, data: ['set'] })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: '"data" must be an object.' })
    expect(saveJevDocument).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/jev/documents/:id restore and checks', () => {
  it('passes the restored version to the plan', async () => {
    saveJevDocument.mockResolvedValue({ conflict: false, document: { id: 'legal', rev: 5, data: {}, setVersion: 4 } })

    await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 4, restoredFrom: 2, data: { set: LEGAL_SET } })

    const [, options] = saveJevDocument.mock.calls[0]
    expect(options.plan({ rev: 4, data: { set: { ...LEGAL_SET, minConfidence: 0.7 } } }).change).toBe(
      'Restored v2; Min confidence 0.7 → 0.75'
    )
  })

  it('rejects an invalid restored version', async () => {
    const res = await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 4, restoredFrom: 0, data: { set: LEGAL_SET } })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: '"restoredFrom" must be a set version.' })
  })

  it('returns 422 with the reason when the save breaks a rule', async () => {
    saveJevDocument.mockResolvedValue({ conflict: false, error: 'The name is required.' })

    const res = await request(app)
      .put('/api/admin/config/jev/documents/legal')
      .send({ rev: 1, data: { enabled: true, set: LEGAL_SET } })

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'The name is required.' })
  })
})

describe('GET /api/admin/config/jev/documents/:id/versions', () => {
  it('returns the requested page of set versions', async () => {
    const versions = { entries: [{ version: 2, at: SAVED_AT, author: 'ana@example.com', change: 'Questions' }] }
    listJevSetVersions.mockResolvedValue({ ...versions, total: 2, page: 1, pageSize: 5 })
    countJevCallsBySetVersion.mockResolvedValue([])

    const res = await request(app).get('/api/admin/config/jev/documents/github/versions?page=1')

    expect(res.status).toBe(200)
    expect(res.body.entries).toEqual([{ ...versions.entries[0], calls: 0 }])
    expect(listJevSetVersions).toHaveBeenCalledWith('github', 1)
  })
})

describe('Guards in the Jev admin routes', () => {
  it('has a document for each created guard and none for other ids', async () => {
    getJevDocument.mockResolvedValue({ id: 'guard-0a1b2c3d', rev: 2, data: { name: 'Payments', set: LEGAL_SET } })

    const created = await request(app).get('/api/admin/config/jev/documents/guard-0a1b2c3d')
    const unknown = await request(app).get('/api/admin/config/jev/documents/payments')

    expect(created.status).toBe(200)
    expect(created.body.data.name).toBe('Payments')
    expect(unknown.status).toBe(404)
  })

  it('adds the calls of each version of a guard', async () => {
    listJevSetVersions.mockResolvedValue({
      entries: [{ version: 2 }, { version: 1 }],
      total: 2,
      page: 1,
      pageSize: 5,
    })
    countJevCallsBySetVersion.mockResolvedValue([{ setVersion: 2, calls: 17 }])

    const res = await request(app).get('/api/admin/config/jev/documents/github/versions')

    expect(res.body.entries).toEqual([
      { version: 2, calls: 17 },
      { version: 1, calls: 0 },
    ])
    expect(countJevCallsBySetVersion).toHaveBeenCalledWith('github')
  })

  it('leaves the versions of the shared settings without calls', async () => {
    listJevSetVersions.mockResolvedValue({ entries: [], total: 0, page: 1, pageSize: 5 })

    await request(app).get('/api/admin/config/jev/documents/jev/versions')

    expect(countJevCallsBySetVersion).not.toHaveBeenCalled()
  })
})
