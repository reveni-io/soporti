import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { DrizzleQueryError } from 'drizzle-orm'

const listSendcloudAccounts = vi.fn()
const createSendcloudAccount = vi.fn()
const deleteSendcloudAccount = vi.fn()
vi.mock('../db/sendcloud-accounts.js', () => ({
  listSendcloudAccounts,
  createSendcloudAccount,
  deleteSendcloudAccount,
}))

const { _resetSendcloudSettingsCacheForTests } = await import('../sendcloud/settings.js')
const { default: adminSendcloudRouter } = await import('./admin-sendcloud.js')

const app = express()
app.use(express.json())
app.use('/api/admin/config/sendcloud', adminSendcloudRouter)

const CREATED_AT = '2026-10-01T10:00:00.000Z'
const PUBLIC_KEY = 'public-key-123'
const SECRET_KEY = 'secret-key-456'
const STORED = { id: 1, name: 'Acme EU', publicKey: PUBLIC_KEY, secretKey: SECRET_KEY, createdAt: CREATED_AT }
const BODY = { name: 'Acme US', publicKey: PUBLIC_KEY, secretKey: SECRET_KEY }
const INSERT_SQL = 'insert into "sendcloud_accounts" ("name", "public_key", "secret_key") values ($1, $2, $3)'

function failedInsert(cause) {
  return new DrizzleQueryError(INSERT_SQL, [BODY.name, PUBLIC_KEY, SECRET_KEY], cause)
}

function loggedText() {
  return JSON.stringify(console.error.mock.calls.map(call => call.map(String)))
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetSendcloudSettingsCacheForTests()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  listSendcloudAccounts.mockResolvedValue([STORED])
})

describe('GET /api/admin/config/sendcloud', () => {
  it('lists the linked accounts without their keys', async () => {
    const res = await request(app).get('/api/admin/config/sendcloud')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ accounts: [{ id: 1, name: 'Acme EU', createdAt: CREATED_AT }] })
    expect(JSON.stringify(res.body)).not.toContain(SECRET_KEY)
    expect(JSON.stringify(res.body)).not.toContain(PUBLIC_KEY)
  })

  it('answers 500 when the accounts cannot be read', async () => {
    listSendcloudAccounts.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/sendcloud')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the Sendcloud accounts.' })
  })
})

describe('POST /api/admin/config/sendcloud/accounts', () => {
  it('links the trimmed account and returns it without its keys', async () => {
    createSendcloudAccount.mockResolvedValue({ id: 2, name: 'Acme US', createdAt: CREATED_AT })

    const res = await request(app)
      .post('/api/admin/config/sendcloud/accounts')
      .send({ ...BODY, name: '  Acme US  ' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ account: { id: 2, name: 'Acme US', createdAt: CREATED_AT } })
    expect(createSendcloudAccount).toHaveBeenCalledTimes(1)
    expect(createSendcloudAccount).toHaveBeenCalledWith(BODY)
  })

  it.each([
    [{ ...BODY, name: '' }, 'The account name must be between 1 and 60 characters.'],
    [{ ...BODY, publicKey: 'x' }, 'That does not look like a Sendcloud public key.'],
    [{ ...BODY, secretKey: 'with spaces inside' }, 'That does not look like a Sendcloud secret key.'],
  ])('answers 400 for %j before touching the database', async (body, error) => {
    const res = await request(app).post('/api/admin/config/sendcloud/accounts').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
    expect(listSendcloudAccounts).not.toHaveBeenCalled()
    expect(createSendcloudAccount).not.toHaveBeenCalled()
  })

  it('answers 409 for a name already linked, whatever its case', async () => {
    const res = await request(app)
      .post('/api/admin/config/sendcloud/accounts')
      .send({ ...BODY, name: 'acme eu' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A Sendcloud account with this name already exists.' })
    expect(createSendcloudAccount).not.toHaveBeenCalled()
  })

  it('answers 409 when the database reports the unique violation through drizzle', async () => {
    createSendcloudAccount.mockRejectedValue(failedInsert(Object.assign(new Error('duplicate key'), { code: '23505' })))

    const res = await request(app).post('/api/admin/config/sendcloud/accounts').send(BODY)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A Sendcloud account with this name already exists.' })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('answers 500 and never logs the keys the failed insert carried', async () => {
    createSendcloudAccount.mockRejectedValue(failedInsert(new Error('Connection terminated unexpectedly')))

    const res = await request(app).post('/api/admin/config/sendcloud/accounts').send(BODY)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to link the Sendcloud account.' })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      'Failed to link the Sendcloud account:',
      'Connection terminated unexpectedly'
    )
    expect(loggedText()).not.toContain(SECRET_KEY)
    expect(loggedText()).not.toContain(PUBLIC_KEY)
  })

  it('logs only the error name when the failure has no cause', async () => {
    createSendcloudAccount.mockRejectedValue(failedInsert(undefined))

    await request(app).post('/api/admin/config/sendcloud/accounts').send(BODY)

    expect(console.error).toHaveBeenCalledWith('Failed to link the Sendcloud account:', 'Error')
    expect(loggedText()).not.toContain(SECRET_KEY)
  })
})

describe('DELETE /api/admin/config/sendcloud/accounts/:id', () => {
  it('removes the account', async () => {
    deleteSendcloudAccount.mockResolvedValue(true)

    const res = await request(app).delete('/api/admin/config/sendcloud/accounts/1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true })
    expect(deleteSendcloudAccount).toHaveBeenCalledWith(1)
  })

  it('answers 400 for an id that is not a number', async () => {
    const res = await request(app).delete('/api/admin/config/sendcloud/accounts/abc')

    expect(res.status).toBe(400)
    expect(deleteSendcloudAccount).not.toHaveBeenCalled()
  })

  it('answers 404 for an account that does not exist', async () => {
    deleteSendcloudAccount.mockResolvedValue(false)

    const res = await request(app).delete('/api/admin/config/sendcloud/accounts/99')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Sendcloud account not found.' })
  })

  it('answers 500 when the account cannot be removed', async () => {
    deleteSendcloudAccount.mockRejectedValue(new Error('db down'))

    const res = await request(app).delete('/api/admin/config/sendcloud/accounts/1')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to remove the Sendcloud account.' })
  })
})
