import { describe, it, expect } from 'vitest'
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto'
import { encryptPushPayload } from './encrypt.js'

const RFC_PLAINTEXT = 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'
const RFC_SENDER_PUBLIC_KEY = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
const RFC_SENDER_PRIVATE_KEY = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
const RFC_RECEIVER_PUBLIC_KEY =
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const RFC_RECEIVER_PRIVATE_KEY = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'
const RFC_SALT = 'DGv6ra1nlYgDCS1FRnbzlw'
const RFC_AUTH_SECRET = 'BTBZMqHH6r4Tts7J_aSIgg'
const RFC_MESSAGE =
  'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
  'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
  'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'

const HEADER_BYTES = 86
const TAG_BYTES = 16

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url')
}

function decrypt(message, { receiver, auth }) {
  const salt = message.subarray(0, 16)
  const recordSize = message.readUInt32BE(16)
  const keyIdLength = message.readUInt8(20)
  const senderPublicKey = message.subarray(21, 21 + keyIdLength)
  const record = message.subarray(21 + keyIdLength)

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), senderPublicKey])
  const ikm = hkdfSync('sha256', receiver.computeSecret(senderPublicKey), auth, keyInfo, 32)
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))

  const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
  decipher.setAuthTag(record.subarray(record.length - TAG_BYTES))
  const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - TAG_BYTES)), decipher.final()])

  return { recordSize, keyIdLength, senderPublicKey, delimiter: padded.at(-1), plaintext: padded.subarray(0, -1) }
}

describe('encryptPushPayload', () => {
  it('reproduces the aes128gcm message of RFC 8291 Appendix A byte for byte', () => {
    const message = encryptPushPayload(
      fromBase64Url(RFC_PLAINTEXT),
      { p256dh: RFC_RECEIVER_PUBLIC_KEY, auth: RFC_AUTH_SECRET },
      { senderPrivateKey: fromBase64Url(RFC_SENDER_PRIVATE_KEY), salt: fromBase64Url(RFC_SALT) }
    )

    expect(message.toString('base64url')).toBe(RFC_MESSAGE)
  })

  it('writes the salt, a 4096 record size and the sender public key as the key id in an 86-byte header', () => {
    const message = encryptPushPayload(
      fromBase64Url(RFC_PLAINTEXT),
      { p256dh: RFC_RECEIVER_PUBLIC_KEY, auth: RFC_AUTH_SECRET },
      { senderPrivateKey: fromBase64Url(RFC_SENDER_PRIVATE_KEY), salt: fromBase64Url(RFC_SALT) }
    )

    expect(message.subarray(0, 16).toString('base64url')).toBe(RFC_SALT)
    expect(message.readUInt32BE(16)).toBe(4096)
    expect(message.readUInt8(20)).toBe(65)
    expect(message.subarray(21, HEADER_BYTES).toString('base64url')).toBe(RFC_SENDER_PUBLIC_KEY)
  })

  it('lets the receiver of the RFC example decrypt the message with its private key', () => {
    const receiver = createECDH('prime256v1')
    receiver.setPrivateKey(fromBase64Url(RFC_RECEIVER_PRIVATE_KEY))

    const { plaintext, delimiter } = decrypt(fromBase64Url(RFC_MESSAGE), {
      receiver,
      auth: fromBase64Url(RFC_AUTH_SECRET),
    })

    expect(delimiter).toBe(0x02)
    expect(plaintext.toString('utf8')).toBe('When I grow up, I want to be a watermelon')
  })

  it('round-trips a payload with a fresh sender key and salt that the user agent decrypts', () => {
    const receiver = createECDH('prime256v1')
    receiver.generateKeys()
    const auth = randomBytes(16)
    const payload = Buffer.from(JSON.stringify({ title: 'Sales bot', body: '3 refunds over €500', url: '/bots/12' }))

    const message = encryptPushPayload(payload, {
      p256dh: receiver.getPublicKey().toString('base64url'),
      auth: auth.toString('base64url'),
    })
    const decrypted = decrypt(message, { receiver, auth })

    expect(decrypted.recordSize).toBe(4096)
    expect(decrypted.keyIdLength).toBe(65)
    expect(decrypted.senderPublicKey[0]).toBe(0x04)
    expect(decrypted.delimiter).toBe(0x02)
    expect(JSON.parse(decrypted.plaintext.toString('utf8'))).toEqual({
      title: 'Sales bot',
      body: '3 refunds over €500',
      url: '/bots/12',
    })
  })

  it('uses a new sender key and salt for every message', () => {
    const receiver = createECDH('prime256v1')
    receiver.generateKeys()
    const keys = { p256dh: receiver.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }

    const first = encryptPushPayload(Buffer.from('same'), keys)
    const second = encryptPushPayload(Buffer.from('same'), keys)

    expect(first.subarray(0, 16).equals(second.subarray(0, 16))).toBe(false)
    expect(first.subarray(21, HEADER_BYTES).equals(second.subarray(21, HEADER_BYTES))).toBe(false)
  })
})
