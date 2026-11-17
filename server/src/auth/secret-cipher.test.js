import { describe, it, expect, vi, beforeEach } from 'vitest'

const FIRST_SECRET = 'first-jwt-secret-0123456789abcdef'
const config = { jwt: { secret: FIRST_SECRET } }
vi.mock('../config.js', () => ({ default: config }))

const { encryptSecret, decryptSecret } = await import('./secret-cipher.js')

const SECRET = 'GOCSPX-client-secret-value'
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/

beforeEach(() => {
  config.jwt.secret = FIRST_SECRET
})

describe('secret-cipher', () => {
  it('round-trips a secret', () => {
    expect(decryptSecret(encryptSecret(SECRET))).toBe(SECRET)
  })

  it('writes a versioned blob that never contains the secret in clear', () => {
    const blob = encryptSecret(SECRET)
    const [version, ...parts] = blob.split(':')

    expect(version).toBe('v1')
    expect(parts).toHaveLength(3)
    parts.forEach(part => expect(part).toMatch(BASE64URL_RE))
    expect(blob).not.toContain(SECRET)
  })

  it('uses a fresh iv for every encryption', () => {
    expect(encryptSecret(SECRET)).not.toBe(encryptSecret(SECRET))
  })

  it('fails to decrypt once the JWT secret has rotated', () => {
    const blob = encryptSecret(SECRET)
    config.jwt.secret = 'rotated-jwt-secret-0123456789abcdef'

    expect(() => decryptSecret(blob)).toThrow()
  })

  it('rejects a tampered ciphertext', () => {
    const [version, iv, tag, ciphertext] = encryptSecret(SECRET).split(':')
    const bytes = Buffer.from(ciphertext, 'base64url')
    bytes[0] ^= 0xff
    const tampered = [version, iv, tag, bytes.toString('base64url')].join(':')

    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('rejects a blob in an unknown format', () => {
    expect(() => decryptSecret('plain-refresh-token')).toThrow(/format/)
    expect(() => decryptSecret('v2:a:b:c')).toThrow(/format/)
    expect(() => decryptSecret('v1:a:b:c:d')).toThrow(/format/)
  })
})
