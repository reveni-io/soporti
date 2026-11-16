import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { DrizzleQueryError } from 'drizzle-orm'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const listPostgresConnections = vi.fn()
const createPostgresConnection = vi.fn()
const updatePostgresConnection = vi.fn()
const deletePostgresConnection = vi.fn()
vi.mock('../db/postgres-connections.js', () => ({
  listPostgresConnections,
  createPostgresConnection,
  updatePostgresConnection,
  deletePostgresConnection,
}))

const clearQueryCache = vi.fn()
vi.mock('../analytics/query-cache.js', () => ({ clearQueryCache }))

const { _resetPostgresSettingsCacheForTests } = await import('../postgres/settings.js')
const { default: adminPostgresRouter } = await import('./admin-postgres.js')

const app = express()
app.use(express.json())
app.use('/api/admin/config/postgres', adminPostgresRouter)

const CREATED_AT = '2026-10-01T10:00:00.000Z'
const SECRET = 'postgresql://reader:hunter2@db.internal:5432/prod'
const STORED = { id: 1, name: 'production', connectionString: SECRET, createdAt: CREATED_AT }
const BODY = { name: 'billing', connectionString: SECRET }
const INSERT_SQL = 'insert into "postgres_connections" ("name", "connection_string") values ($1, $2)'

function failedWrite(cause) {
  return new DrizzleQueryError(INSERT_SQL, [BODY.name, SECRET], cause)
}

function loggedText() {
  return JSON.stringify(console.error.mock.calls.map(call => call.map(String)))
}

beforeEach(() => {
  vi.clearAllMocks()
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetPostgresSettingsCacheForTests()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  listPostgresConnections.mockResolvedValue([STORED])
  getConfigValue.mockResolvedValue(250)
})

describe('GET /api/admin/config/postgres', () => {
  it('lists the connections without their connection strings, plus the row limit', async () => {
    const res = await request(app).get('/api/admin/config/postgres')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ connections: [{ id: 1, name: 'production', createdAt: CREATED_AT }], maxRows: 250 })
    expect(JSON.stringify(res.body)).not.toContain('hunter2')
  })

  it('answers 500 when the settings cannot be read', async () => {
    listPostgresConnections.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/postgres')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to read the database settings.' })
  })
})

describe('POST /api/admin/config/postgres/connections', () => {
  it('adds the trimmed connection and returns it without its connection string', async () => {
    createPostgresConnection.mockResolvedValue({ id: 2, name: 'billing', createdAt: CREATED_AT })

    const res = await request(app)
      .post('/api/admin/config/postgres/connections')
      .send({ ...BODY, name: '  billing  ' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ connection: { id: 2, name: 'billing', createdAt: CREATED_AT } })
    expect(createPostgresConnection).toHaveBeenCalledTimes(1)
    expect(createPostgresConnection).toHaveBeenCalledWith(BODY)
  })

  it.each([
    [{ ...BODY, name: '' }, 'The name must be between 1 and 60 characters, on a single line.'],
    [{ ...BODY, connectionString: '' }, 'That does not look like a valid PostgreSQL connection string.'],
  ])('answers 400 for %j before touching the database', async (body, error) => {
    const res = await request(app).post('/api/admin/config/postgres/connections').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
    expect(createPostgresConnection).not.toHaveBeenCalled()
  })

  it('answers 409 for a name already connected, whatever its case', async () => {
    const res = await request(app)
      .post('/api/admin/config/postgres/connections')
      .send({ ...BODY, name: 'PRODUCTION' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A database with this name is already connected.' })
    expect(createPostgresConnection).not.toHaveBeenCalled()
  })

  it('answers 409 when the database reports the unique violation through drizzle', async () => {
    createPostgresConnection.mockRejectedValue(failedWrite(Object.assign(new Error('dup'), { code: '23505' })))

    const res = await request(app).post('/api/admin/config/postgres/connections').send(BODY)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A database with this name is already connected.' })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('answers 500 and never logs the connection string the failed insert carried', async () => {
    createPostgresConnection.mockRejectedValue(failedWrite(new Error('Connection terminated unexpectedly')))

    const res = await request(app).post('/api/admin/config/postgres/connections').send(BODY)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to add the database connection.' })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      'Failed to add the database connection:',
      'Connection terminated unexpectedly'
    )
    expect(loggedText()).not.toContain('hunter2')
  })
})

describe('PUT /api/admin/config/postgres/connections/:id', () => {
  it('renames a connection without clearing the query cache', async () => {
    updatePostgresConnection.mockResolvedValue({ id: 1, name: 'main', createdAt: CREATED_AT })

    const res = await request(app).put('/api/admin/config/postgres/connections/1').send({ name: ' main ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ connection: { id: 1, name: 'main', createdAt: CREATED_AT } })
    expect(updatePostgresConnection).toHaveBeenCalledTimes(1)
    expect(updatePostgresConnection).toHaveBeenCalledWith(1, { name: 'main' })
    expect(clearQueryCache).not.toHaveBeenCalled()
  })

  it('replaces the connection string and clears the query cache once', async () => {
    updatePostgresConnection.mockResolvedValue({ id: 1, name: 'production', createdAt: CREATED_AT })

    const res = await request(app).put('/api/admin/config/postgres/connections/1').send({ connectionString: SECRET })

    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain('hunter2')
    expect(updatePostgresConnection).toHaveBeenCalledWith(1, { connectionString: SECRET })
    expect(clearQueryCache).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['/api/admin/config/postgres/connections/abc', { name: 'x' }, 'Invalid database connection ID.'],
    ['/api/admin/config/postgres/connections/1', {}, 'Send a new name or a new connection string.'],
  ])('answers 400 for %s with %j', async (path, body, error) => {
    const res = await request(app).put(path).send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
    expect(updatePostgresConnection).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown connection', async () => {
    updatePostgresConnection.mockResolvedValue(null)

    const res = await request(app).put('/api/admin/config/postgres/connections/9').send({ name: 'x' })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Database connection not found.' })
    expect(clearQueryCache).not.toHaveBeenCalled()
  })

  it('answers 409 when renaming onto another connection', async () => {
    listPostgresConnections.mockResolvedValue([STORED, { ...STORED, id: 2, name: 'billing' }])

    const res = await request(app).put('/api/admin/config/postgres/connections/1').send({ name: 'Billing' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A database with this name is already connected.' })
    expect(updatePostgresConnection).not.toHaveBeenCalled()
  })

  it('answers 500 and never logs the connection string', async () => {
    updatePostgresConnection.mockRejectedValue(failedWrite(new Error('Connection terminated unexpectedly')))

    const res = await request(app).put('/api/admin/config/postgres/connections/1').send({ connectionString: SECRET })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the database connection.' })
    expect(loggedText()).not.toContain('hunter2')
  })
})

describe('DELETE /api/admin/config/postgres/connections/:id', () => {
  it('removes the connection and clears the query cache', async () => {
    deletePostgresConnection.mockResolvedValue(true)

    const res = await request(app).delete('/api/admin/config/postgres/connections/1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true })
    expect(deletePostgresConnection).toHaveBeenCalledWith(1)
    expect(clearQueryCache).toHaveBeenCalledTimes(1)
  })

  it('answers 404 when there is nothing to remove', async () => {
    deletePostgresConnection.mockResolvedValue(false)

    const res = await request(app).delete('/api/admin/config/postgres/connections/9')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Database connection not found.' })
    expect(clearQueryCache).not.toHaveBeenCalled()
  })

  it('answers 400 for a bad id', async () => {
    const res = await request(app).delete('/api/admin/config/postgres/connections/abc')

    expect(res.status).toBe(400)
    expect(deletePostgresConnection).not.toHaveBeenCalled()
  })

  it('answers 500 when the removal fails', async () => {
    deletePostgresConnection.mockRejectedValue(new Error('db down'))

    const res = await request(app).delete('/api/admin/config/postgres/connections/1')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to remove the database connection.' })
  })
})

describe('PUT /api/admin/config/postgres/max-rows', () => {
  it('saves a valid integer and echoes the effective value', async () => {
    getConfigValue.mockResolvedValue(500)

    const res = await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 500 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ maxRows: 500 })
    expect(setConfigValue).toHaveBeenCalledWith('postgres_max_rows', 500)
  })

  it('clears with an empty value, back to the default', async () => {
    getConfigValue.mockResolvedValue(null)

    const res = await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ maxRows: 100 })
    expect(setConfigValue).toHaveBeenCalledWith('postgres_max_rows', null)
  })

  it('rejects non-integers and values below 1', async () => {
    for (const maxRows of [0, -5, 2.5, 'abc']) {
      const res = await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows })
      expect(res.status).toBe(400)
    }
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('answers 500 when the limit cannot be saved', async () => {
    setConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 5 })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the row limit.' })
  })

  it('answers 500 when the limit cannot be cleared', async () => {
    setConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: '' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the row limit.' })
  })
})
