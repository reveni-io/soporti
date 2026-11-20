import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto'

vi.mock('./vapid.js', () => ({ buildVapidAuthorization: vi.fn() }))

const { buildVapidAuthorization } = await import('./vapid.js')
const { sendPushMessage } = await import('./client.js')

const mockFetch = vi.fn()
global.fetch = mockFetch

const receiver = createECDH('prime256v1')
receiver.generateKeys()
const AUTH = randomBytes(16)
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'
const SUBSCRIPTION = {
  endpoint: ENDPOINT,
  p256dh: receiver.getPublicKey().toString('base64url'),
  auth: AUTH.toString('base64url'),
}
const PAYLOAD = { title: 'Sales bot', body: '3 refunds over €500 since yesterday', url: '/bots/12', tag: 'bot-12' }

function decryptBody(body) {
  const salt = body.subarray(0, 16)
  const senderPublicKey = body.subarray(21, 86)
  const record = body.subarray(86)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), senderPublicKey])
  const ikm = hkdfSync('sha256', receiver.computeSecret(senderPublicKey), AUTH, keyInfo, 32)
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
  decipher.setAuthTag(record.subarray(-16))
  const padded = Buffer.concat([decipher.update(record.subarray(0, -16)), decipher.final()])

  return JSON.parse(padded.subarray(0, -1).toString('utf8'))
}

beforeEach(() => {
  vi.clearAllMocks()
  buildVapidAuthorization.mockResolvedValue('vapid t=header.claims.signature, k=BPublicKey')
  mockFetch.mockResolvedValue({ ok: true, status: 201 })
})

describe('sendPushMessage', () => {
  it('posts the encrypted payload to the endpoint with the Web Push headers', async () => {
    const result = await sendPushMessage(SUBSCRIPTION, PAYLOAD)

    expect(result).toEqual({ outcome: 'delivered', status: 201 })
    expect(buildVapidAuthorization).toHaveBeenCalledWith(ENDPOINT)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe(ENDPOINT)
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        TTL: '86400',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Urgency: 'normal',
        Authorization: 'vapid t=header.claims.signature, k=BPublicKey',
      },
      redirect: 'error',
    })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(decryptBody(options.body)).toEqual(PAYLOAD)
  })

  it('releases the response body', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    mockFetch.mockResolvedValue({ ok: true, status: 201, body: { cancel } })

    await sendPushMessage(SUBSCRIPTION, PAYLOAD)

    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it.each([[404], [410]])('reports the subscription as gone when the push service answers %s', async status => {
    mockFetch.mockResolvedValue({ ok: false, status })

    expect(await sendPushMessage(SUBSCRIPTION, PAYLOAD)).toEqual({ outcome: 'gone', status })
  })

  it.each([[400], [403], [413], [429], [500]])('reports a failure when the push service answers %s', async status => {
    mockFetch.mockResolvedValue({ ok: false, status })

    expect(await sendPushMessage(SUBSCRIPTION, PAYLOAD)).toEqual({ outcome: 'failed', status })
  })

  it('reports a stored subscription that is no longer valid as gone without calling anyone', async () => {
    const result = await sendPushMessage({ ...SUBSCRIPTION, endpoint: 'https://attacker.example.com/push' }, PAYLOAD)

    expect(result).toEqual({ outcome: 'gone', status: null })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(buildVapidAuthorization).not.toHaveBeenCalled()
  })

  it('rejects when the request fails', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    await expect(sendPushMessage(SUBSCRIPTION, PAYLOAD)).rejects.toThrow('fetch failed')
  })
})
