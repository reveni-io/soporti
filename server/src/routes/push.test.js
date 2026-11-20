import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createECDH, randomBytes } from 'node:crypto'

vi.mock('../db/push-subscriptions.js', () => ({
  upsertPushSubscription: vi.fn(),
  listPushSubscriptions: vi.fn(),
  deleteUserPushSubscription: vi.fn(),
}))
vi.mock('../push/vapid.js', () => ({ getVapidPublicKey: vi.fn() }))
vi.mock('../push/notify.js', () => ({ notifySubscriptions: vi.fn() }))

const { upsertPushSubscription, listPushSubscriptions, deleteUserPushSubscription } =
  await import('../db/push-subscriptions.js')
const { getVapidPublicKey } = await import('../push/vapid.js')
const { notifySubscriptions } = await import('../push/notify.js')
const { default: pushRouter } = await import('./push.js')

const receiver = createECDH('prime256v1')
receiver.generateKeys()

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/dGVzdC1zdWJzY3JpcHRpb24'
const KEYS = { p256dh: receiver.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }
const PUBLIC_KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { id: 7 }
  next()
})
app.use('/', pushRouter)

beforeEach(() => {
  vi.clearAllMocks()
  getVapidPublicKey.mockResolvedValue(PUBLIC_KEY)
  upsertPushSubscription.mockResolvedValue(undefined)
  deleteUserPushSubscription.mockResolvedValue(undefined)
  listPushSubscriptions.mockResolvedValue([{ endpoint: ENDPOINT, ...KEYS }])
  notifySubscriptions.mockResolvedValue(1)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('push routes', () => {
  describe('GET /key', () => {
    it('returns the VAPID public key', async () => {
      const res = await request(app).get('/key')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ publicKey: PUBLIC_KEY })
    })

    it('answers 500 without the raw error when the key cannot be loaded', async () => {
      getVapidPublicKey.mockRejectedValue(new Error('db down at 10.0.0.3'))

      const res = await request(app).get('/key')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to load the push public key.' })
    })
  })

  describe('POST /subscriptions', () => {
    it('saves the subscription of the browser for the user, with its user agent', async () => {
      const res = await request(app)
        .post('/subscriptions')
        .set('User-Agent', 'Mozilla/5.0 (iPhone)')
        .send({ endpoint: ENDPOINT, expirationTime: null, keys: KEYS })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ saved: true })
      expect(upsertPushSubscription).toHaveBeenCalledTimes(1)
      expect(upsertPushSubscription).toHaveBeenCalledWith(7, {
        endpoint: ENDPOINT,
        ...KEYS,
        userAgent: 'Mozilla/5.0 (iPhone)',
      })
    })

    it('keeps at most 255 characters of the user agent', async () => {
      await request(app)
        .post('/subscriptions')
        .set('User-Agent', 'a'.repeat(400))
        .send({ endpoint: ENDPOINT, keys: KEYS })

      expect(upsertPushSubscription.mock.calls[0][1].userAgent).toBe('a'.repeat(255))
    })

    it('stores no user agent when the browser sends none', async () => {
      await request(app).post('/subscriptions').unset('User-Agent').send({ endpoint: ENDPOINT, keys: KEYS })

      expect(upsertPushSubscription.mock.calls[0][1].userAgent).toBeNull()
    })

    it.each([
      ['an http endpoint', { endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys: KEYS }],
      ['an endpoint outside the push services', { endpoint: 'https://internal.example.com/hook', keys: KEYS }],
      ['no keys', { endpoint: ENDPOINT }],
      ['a short p256dh key', { endpoint: ENDPOINT, keys: { ...KEYS, p256dh: KEYS.p256dh.slice(0, 40) } }],
      ['a long auth secret', { endpoint: ENDPOINT, keys: { ...KEYS, auth: randomBytes(32).toString('base64url') } }],
    ])('answers 400 for %s', async (_label, body) => {
      const res = await request(app).post('/subscriptions').send(body)

      expect(res.status).toBe(400)
      expect(res.body.error).toEqual(expect.any(String))
      expect(upsertPushSubscription).not.toHaveBeenCalled()
    })

    it('answers 500 when the subscription cannot be saved', async () => {
      upsertPushSubscription.mockRejectedValue(new Error('db down'))

      const res = await request(app).post('/subscriptions').send({ endpoint: ENDPOINT, keys: KEYS })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to save the push subscription.' })
    })
  })

  describe('DELETE /subscriptions', () => {
    it('deletes the endpoint for the user and answers 204', async () => {
      const res = await request(app).delete('/subscriptions').send({ endpoint: ENDPOINT })

      expect(res.status).toBe(204)
      expect(deleteUserPushSubscription).toHaveBeenCalledTimes(1)
      expect(deleteUserPushSubscription).toHaveBeenCalledWith(ENDPOINT, 7)
    })

    it('answers 204 for an endpoint that is not a push service, since there is nothing to delete', async () => {
      const res = await request(app).delete('/subscriptions').send({ endpoint: 'https://unknown.example.com/x' })

      expect(res.status).toBe(204)
      expect(deleteUserPushSubscription).toHaveBeenCalledWith('https://unknown.example.com/x', 7)
    })

    it.each([[{}], [{ endpoint: '' }], [{ endpoint: 'x'.repeat(2049) }]])('answers 400 for %j', async body => {
      const res = await request(app).delete('/subscriptions').send(body)

      expect(res.status).toBe(400)
      expect(deleteUserPushSubscription).not.toHaveBeenCalled()
    })

    it('answers 500 when the subscription cannot be deleted', async () => {
      deleteUserPushSubscription.mockRejectedValue(new Error('db down'))

      const res = await request(app).delete('/subscriptions').send({ endpoint: ENDPOINT })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to delete the push subscription.' })
    })
  })

  describe('POST /test', () => {
    it('sends a test notification to every device of the user and returns how many got it', async () => {
      const subscriptions = [
        { endpoint: ENDPOINT, ...KEYS },
        { endpoint: 'https://web.push.apple.com/QGx2abc', ...KEYS },
      ]
      listPushSubscriptions.mockResolvedValue(subscriptions)
      notifySubscriptions.mockResolvedValue(2)

      const res = await request(app).post('/test')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ sent: 2 })
      expect(listPushSubscriptions).toHaveBeenCalledWith(7)
      expect(notifySubscriptions).toHaveBeenCalledTimes(1)
      expect(notifySubscriptions).toHaveBeenCalledWith(subscriptions, {
        title: 'Soporti',
        body: 'Notifications are working on this device.',
        url: '/chat',
        tag: 'test',
      })
    })

    it('answers 404 when the user has no device subscribed', async () => {
      listPushSubscriptions.mockResolvedValue([])

      const res = await request(app).post('/test')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'No device is subscribed to notifications.' })
      expect(notifySubscriptions).not.toHaveBeenCalled()
    })

    it('answers 500 when the subscriptions cannot be loaded', async () => {
      listPushSubscriptions.mockRejectedValue(new Error('db down'))

      const res = await request(app).post('/test')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to send the test notification.' })
    })
  })
})
