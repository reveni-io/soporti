import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPrivateKey, createPublicKey, generateKeyPairSync, verify } from 'node:crypto'

const config = vi.hoisted(() => ({
  publicUrl: 'https://soporti.acme.com',
  jwt: { secret: 'vapid-test-secret-0123456789abcdef0123456789' },
}))
vi.mock('../config.js', () => ({ default: config }))
vi.mock('../db/app-config.js', () => ({
  getConfigValue: vi.fn(),
  insertConfigValueIfAbsent: vi.fn(),
  deleteConfigValueIfUnchanged: vi.fn(),
}))
vi.mock('../db/push-subscriptions.js', () => ({ deleteAllPushSubscriptions: vi.fn() }))

const { getConfigValue, insertConfigValueIfAbsent, deleteConfigValueIfUnchanged } = await import('../db/app-config.js')
const { deleteAllPushSubscriptions } = await import('../db/push-subscriptions.js')
const { decryptSecret, encryptSecret } = await import('../auth/secret-cipher.js')
const { getVapidPublicKey, buildVapidAuthorization, _resetVapidKeysCacheForTests } = await import('./vapid.js')

const KEY = 'push_vapid_private_key'
const NOW = new Date('2026-11-20T10:00:00Z')
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123'

function storedKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const { x, y } = publicKey.export({ format: 'jwk' })
  const point = Buffer.concat([Buffer.from([0x04]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')])

  return {
    stored: encryptSecret(privateKey.export({ format: 'pem', type: 'pkcs8' })),
    publicKey: point.toString('base64url'),
  }
}

function toVerifyKey(publicKey) {
  const point = Buffer.from(publicKey, 'base64url')
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: point.subarray(1, 33).toString('base64url'),
    y: point.subarray(33).toString('base64url'),
  }

  return createPublicKey({ key: jwk, format: 'jwk' })
}

function parseAuthorization(header) {
  const [, token, publicKey] = header.match(/^vapid t=([^,]+), k=(.+)$/)
  const [header64, claims64, signature64] = token.split('.')

  return {
    publicKey,
    header: JSON.parse(Buffer.from(header64, 'base64url').toString()),
    claims: JSON.parse(Buffer.from(claims64, 'base64url').toString()),
    signed: Buffer.from(`${header64}.${claims64}`),
    signature: Buffer.from(signature64, 'base64url'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  _resetVapidKeysCacheForTests()
  config.publicUrl = 'https://soporti.acme.com'
  insertConfigValueIfAbsent.mockResolvedValue(undefined)
  deleteConfigValueIfUnchanged.mockResolvedValue(true)
  deleteAllPushSubscriptions.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('getVapidPublicKey', () => {
  it('returns the stored key as the base64url of its 65-byte uncompressed point', async () => {
    const { stored, publicKey } = storedKeyPair()
    getConfigValue.mockResolvedValue(stored)

    const key = await getVapidPublicKey()

    expect(key).toBe(publicKey)
    expect(Buffer.from(key, 'base64url')).toHaveLength(65)
    expect(Buffer.from(key, 'base64url')[0]).toBe(0x04)
    expect(getConfigValue).toHaveBeenCalledWith(KEY)
    expect(insertConfigValueIfAbsent).not.toHaveBeenCalled()
  })

  it('generates a P-256 key on first use and stores it encrypted, only if nobody stored one meanwhile', async () => {
    let inserted = null
    getConfigValue.mockImplementation(async () => inserted)
    insertConfigValueIfAbsent.mockImplementation(async (_key, value) => {
      inserted = value
    })

    const key = await getVapidPublicKey()

    expect(insertConfigValueIfAbsent).toHaveBeenCalledTimes(1)
    expect(insertConfigValueIfAbsent).toHaveBeenCalledWith(KEY, expect.stringMatching(/^v1:/))
    const privateKey = createPrivateKey(decryptSecret(inserted))
    expect(privateKey.asymmetricKeyDetails).toEqual({ namedCurve: 'prime256v1' })
    expect(inserted).not.toContain('PRIVATE KEY')
    expect(Buffer.from(key, 'base64url')).toHaveLength(65)
    expect(deleteAllPushSubscriptions).not.toHaveBeenCalled()
  })

  it('uses the key another server stored first when both generate one at once', async () => {
    const winner = storedKeyPair()
    getConfigValue.mockResolvedValueOnce(null).mockResolvedValueOnce(winner.stored)

    expect(await getVapidPublicKey()).toBe(winner.publicKey)
    expect(insertConfigValueIfAbsent).toHaveBeenCalledTimes(1)
  })

  it('replaces a key it cannot decrypt and drops the subscriptions bound to it', async () => {
    const replacement = storedKeyPair()
    getConfigValue.mockResolvedValueOnce('v1:from:another:secret').mockResolvedValueOnce(replacement.stored)

    expect(await getVapidPublicKey()).toBe(replacement.publicKey)

    expect(deleteConfigValueIfUnchanged).toHaveBeenCalledTimes(1)
    expect(deleteConfigValueIfUnchanged).toHaveBeenCalledWith(KEY, 'v1:from:another:secret')
    expect(deleteAllPushSubscriptions).toHaveBeenCalledTimes(1)
    expect(insertConfigValueIfAbsent).toHaveBeenCalledWith(KEY, expect.stringMatching(/^v1:/))
    expect(console.error).toHaveBeenCalledWith(
      '[push] Replacing the VAPID key and dropping the subscriptions bound to the old one.'
    )
  })

  it('leaves the subscriptions alone when another server already replaced the unreadable key', async () => {
    const replacement = storedKeyPair()
    getConfigValue.mockResolvedValueOnce('v1:from:another:secret').mockResolvedValueOnce(replacement.stored)
    deleteConfigValueIfUnchanged.mockResolvedValue(false)

    expect(await getVapidPublicKey()).toBe(replacement.publicKey)
    expect(deleteAllPushSubscriptions).not.toHaveBeenCalled()
  })

  it('fails when no readable key is stored even after generating one', async () => {
    getConfigValue.mockResolvedValue('v1:from:another:secret')

    await expect(getVapidPublicKey()).rejects.toThrow('The VAPID key could not be stored.')
  })

  it('reads the key once for concurrent callers and caches it for a minute', async () => {
    const { stored, publicKey } = storedKeyPair()
    getConfigValue.mockResolvedValue(stored)

    expect(await Promise.all([getVapidPublicKey(), getVapidPublicKey()])).toEqual([publicKey, publicKey])
    await getVapidPublicKey()
    expect(getConfigValue).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(NOW.getTime() + 60_001))
    await getVapidPublicKey()
    expect(getConfigValue).toHaveBeenCalledTimes(2)
  })

  it('tries again on the next call after a failed read', async () => {
    const { stored, publicKey } = storedKeyPair()
    getConfigValue.mockRejectedValueOnce(new Error('db down')).mockResolvedValue(stored)

    await expect(getVapidPublicKey()).rejects.toThrow('db down')
    expect(await getVapidPublicKey()).toBe(publicKey)
  })
})

describe('buildVapidAuthorization', () => {
  it('signs an ES256 token for the push service origin with the stored key and announces its public key', async () => {
    const { stored, publicKey } = storedKeyPair()
    getConfigValue.mockResolvedValue(stored)

    const authorization = parseAuthorization(await buildVapidAuthorization(ENDPOINT))

    expect(authorization.publicKey).toBe(publicKey)
    expect(authorization.header).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(authorization.claims).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: NOW.getTime() / 1000 + 12 * 60 * 60,
      sub: 'https://soporti.acme.com',
    })
    expect(authorization.signature).toHaveLength(64)
    expect(
      verify(
        'sha256',
        authorization.signed,
        { key: toVerifyKey(publicKey), dsaEncoding: 'ieee-p1363' },
        authorization.signature
      )
    ).toBe(true)
  })

  it('uses the origin of each endpoint as the audience', async () => {
    getConfigValue.mockResolvedValue(storedKeyPair().stored)

    const { claims } = parseAuthorization(await buildVapidAuthorization('https://web.push.apple.com:443/QGx2abc'))

    expect(claims.aud).toBe('https://web.push.apple.com')
  })

  it('falls back to a mailto subject when the public URL is not https', async () => {
    config.publicUrl = 'http://localhost:3001'
    getConfigValue.mockResolvedValue(storedKeyPair().stored)

    const { claims } = parseAuthorization(await buildVapidAuthorization(ENDPOINT))

    expect(claims.sub).toBe('mailto:push@soporti.invalid')
  })
})
