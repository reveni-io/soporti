import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const getSendcloudAccounts = vi.fn()
const addSendcloudAccount = vi.fn()
const removeSendcloudAccount = vi.fn()
vi.mock('../sendcloud/settings.js', () => ({
  INVALID_SENDCLOUD_ACCOUNT: 'INVALID_SENDCLOUD_ACCOUNT',
  DUPLICATE_SENDCLOUD_ACCOUNT: 'DUPLICATE_SENDCLOUD_ACCOUNT',
  describeSendcloudAccount: ({ id, name, createdAt }) => ({ id, name, createdAt }),
  getSendcloudAccounts,
  addSendcloudAccount,
  removeSendcloudAccount,
}))

const { default: adminSendcloudRouter } = await import('./admin-sendcloud.js')

const app = express()
app.use(express.json())
app.use('/api/admin/config/sendcloud', adminSendcloudRouter)

const CREATED_AT = '2026-10-01T10:00:00.000Z'
const STORED = {
  id: 1,
  name: 'Acme EU',
  publicKey: 'public-key-123',
  secretKey: 'secret-key-456',
  createdAt: CREATED_AT,
}
const BODY = { name: 'Acme EU', publicKey: 'public-key-123', secretKey: 'secret-key-456' }

function codedError(code, message = 'boom') {
  return Object.assign(new Error(message), { code })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/admin/config/sendcloud', () => {
  it('lists the linked accounts without their keys', async () => {
    getSendcloudAccounts.mockResolvedValue([STORED])

    const res = await request(app).get('/api/admin/config/sendcloud')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ accounts: [{ id: 1, name: 'Acme EU', createdAt: CREATED_AT }] })
    expect(JSON.stringify(res.body)).not.toContain('secret-key-456')
    expect(JSON.stringify(res.body)).not.toContain('public-key-123')
  })

  it('answers 500 when the accounts cannot be read', async () => {
    getSendcloudAccounts.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/sendcloud')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the Sendcloud accounts.' })
  })
})

describe('POST /api/admin/config/sendcloud/accounts', () => {
  it('links the account and returns it without its keys', async () => {
    addSendcloudAccount.mockResolvedValue({ id: 2, name: 'Acme EU', createdAt: CREATED_AT })

    const res = await request(app).post('/api/admin/config/sendcloud/accounts').send(BODY)

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ account: { id: 2, name: 'Acme EU', createdAt: CREATED_AT } })
    expect(addSendcloudAccount).toHaveBeenCalledTimes(1)
    expect(addSendcloudAccount).toHaveBeenCalledWith(BODY)
  })

  it('answers 400 with the validation message', async () => {
    addSendcloudAccount.mockRejectedValue(
      codedError('INVALID_SENDCLOUD_ACCOUNT', 'That does not look like a Sendcloud public key.')
    )

    const res = await request(app)
      .post('/api/admin/config/sendcloud/accounts')
      .send({ ...BODY, publicKey: 'x' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'That does not look like a Sendcloud public key.' })
  })

  it.each(['DUPLICATE_SENDCLOUD_ACCOUNT', '23505'])('answers 409 for a duplicate name (%s)', async code => {
    addSendcloudAccount.mockRejectedValue(codedError(code))

    const res = await request(app).post('/api/admin/config/sendcloud/accounts').send(BODY)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'A Sendcloud account with this name already exists.' })
  })

  it('answers 500 without leaking the error', async () => {
    addSendcloudAccount.mockRejectedValue(new Error('connection refused'))

    const res = await request(app).post('/api/admin/config/sendcloud/accounts').send(BODY)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to link the Sendcloud account.' })
  })
})

describe('DELETE /api/admin/config/sendcloud/accounts/:id', () => {
  it('removes the account', async () => {
    removeSendcloudAccount.mockResolvedValue(true)

    const res = await request(app).delete('/api/admin/config/sendcloud/accounts/1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true })
    expect(removeSendcloudAccount).toHaveBeenCalledWith(1)
  })

  it('answers 400 for an id that is not a number', async () => {
    const res = await request(app).delete('/api/admin/config/sendcloud/accounts/abc')

    expect(res.status).toBe(400)
    expect(removeSendcloudAccount).not.toHaveBeenCalled()
  })

  it('answers 404 for an account that does not exist', async () => {
    removeSendcloudAccount.mockResolvedValue(false)

    const res = await request(app).delete('/api/admin/config/sendcloud/accounts/99')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Sendcloud account not found.' })
  })

  it('answers 500 when the account cannot be removed', async () => {
    removeSendcloudAccount.mockRejectedValue(new Error('db down'))

    const res = await request(app).delete('/api/admin/config/sendcloud/accounts/1')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to remove the Sendcloud account.' })
  })
})
