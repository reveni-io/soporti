import { describe, it, expect } from 'vitest'
import { createECDH, randomBytes } from 'node:crypto'
import { parseEndpoint, parsePushSubscription } from './subscription.js'

const receiver = createECDH('prime256v1')
receiver.generateKeys()

const P256DH = receiver.getPublicKey().toString('base64url')
const AUTH = randomBytes(16).toString('base64url')
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/dGVzdC1zdWJzY3JpcHRpb24'

describe('parseEndpoint', () => {
  it('accepts a non-empty string up to 2048 characters', () => {
    expect(parseEndpoint(ENDPOINT)).toEqual({ value: ENDPOINT })
    expect(parseEndpoint('x'.repeat(2048))).toEqual({ value: 'x'.repeat(2048) })
  })

  it.each([[undefined], [''], [42], [{}]])('rejects %s', value => {
    expect(parseEndpoint(value)).toEqual({ error: '"endpoint" must be a non-empty string.' })
  })

  it('rejects an endpoint over 2048 characters', () => {
    expect(parseEndpoint('x'.repeat(2049))).toEqual({ error: '"endpoint" is too long (max 2048 characters).' })
  })
})

describe('parsePushSubscription', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc'],
    ['https://android.googleapis.com/gcm/send/abc'],
    ['https://jmt17.google.com/fcm/send/abc'],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc'],
    ['https://web.push.apple.com/QGx2abc'],
    ['https://wns2-par02p.notify.windows.com/w/?token=abc'],
  ])('accepts a subscription to %s', endpoint => {
    expect(parsePushSubscription({ endpoint, p256dh: P256DH, auth: AUTH })).toEqual({
      value: { endpoint, p256dh: P256DH, auth: AUTH },
    })
  })

  it.each([
    ['http://fcm.googleapis.com/fcm/send/abc'],
    ['https://evil.example.com/fcm.googleapis.com'],
    ['https://fcm.googleapis.com.evil.example.com/abc'],
    ['https://notfcm.googleapis.com/abc'],
    ['https://user:pass@fcm.googleapis.com/abc'],
    ['https://fcm.googleapis.com:8443/abc'],
    ['https://169.254.169.254/latest/meta-data'],
    ['not a url'],
  ])('rejects the endpoint %s', endpoint => {
    expect(parsePushSubscription({ endpoint, p256dh: P256DH, auth: AUTH })).toEqual({
      error: '"endpoint" must be the https URL of a known push service.',
    })
  })

  it('rejects an endpoint over 2048 characters before parsing it', () => {
    const endpoint = `https://fcm.googleapis.com/${'a'.repeat(2048)}`

    expect(parsePushSubscription({ endpoint, p256dh: P256DH, auth: AUTH })).toEqual({
      error: '"endpoint" is too long (max 2048 characters).',
    })
  })

  it.each([
    ['missing', undefined],
    ['not base64url', `${P256DH.slice(0, -1)}+`],
    ['too short', receiver.getPublicKey().subarray(0, 64).toString('base64url')],
    ['compressed', receiver.getPublicKey('base64url', 'compressed')],
    [
      'without the 0x04 prefix',
      Buffer.concat([Buffer.from([0x05]), receiver.getPublicKey().subarray(1)]).toString('base64url'),
    ],
    ['off the curve', Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 1)]).toString('base64url')],
  ])('rejects a p256dh key that is %s', (_label, p256dh) => {
    expect(parsePushSubscription({ endpoint: ENDPOINT, p256dh, auth: AUTH })).toEqual({
      error: '"keys.p256dh" must be a base64url P-256 public key of 65 bytes.',
    })
  })

  it.each([
    ['missing', undefined],
    ['15 bytes', randomBytes(15).toString('base64url')],
    ['17 bytes', randomBytes(17).toString('base64url')],
    ['standard base64 with padding', randomBytes(16).toString('base64')],
  ])('rejects an auth secret that is %s', (_label, auth) => {
    expect(parsePushSubscription({ endpoint: ENDPOINT, p256dh: P256DH, auth })).toEqual({
      error: '"keys.auth" must be a base64url secret of 16 bytes.',
    })
  })
})
