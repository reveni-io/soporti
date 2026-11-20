import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import config from '../config.js'
import { decryptSecret, encryptSecret } from '../auth/secret-cipher.js'
import { deleteConfigValueIfUnchanged, getConfigValue, insertConfigValueIfAbsent } from '../db/app-config.js'
import { deleteAllPushSubscriptions } from '../db/push-subscriptions.js'
import { MS_PER_SECOND } from '../constants.js'

const VAPID_PRIVATE_KEY_KEY = 'push_vapid_private_key'
const CACHE_TTL_MS = 60_000
const CURVE = 'prime256v1'
const ENCODING = 'base64url'
const PRIVATE_KEY_EXPORT = { format: 'pem', type: 'pkcs8' }
const UNCOMPRESSED_POINT_PREFIX = Buffer.from([0x04])
const JWT_HEADER = { typ: 'JWT', alg: 'ES256' }
const JWT_TTL_SECONDS = 12 * 60 * 60
const SIGNATURE_DIGEST = 'sha256'
const SIGNATURE_ENCODING = 'ieee-p1363'
const HTTPS_PREFIX = 'https://'
const FALLBACK_SUBJECT = 'mailto:push@soporti.invalid'

let cache = null
let pending = null

function generatePrivateKey() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: CURVE })

  return encryptSecret(privateKey.export(PRIVATE_KEY_EXPORT))
}

function toPublicKey(privateKey) {
  const { x, y } = createPublicKey(privateKey).export({ format: 'jwk' })

  return Buffer.concat([UNCOMPRESSED_POINT_PREFIX, Buffer.from(x, ENCODING), Buffer.from(y, ENCODING)]).toString(
    ENCODING
  )
}

function decodeKeys(stored) {
  try {
    const privateKey = createPrivateKey(decryptSecret(stored))
    return { privateKey, publicKey: toPublicKey(privateKey) }
  } catch (err) {
    console.error('[push] Failed to decrypt the stored VAPID key:', err.message)
    return null
  }
}

async function discardUnreadableKeys(stored) {
  console.error('[push] Replacing the VAPID key and dropping the subscriptions bound to the old one.')

  if (await deleteConfigValueIfUnchanged(VAPID_PRIVATE_KEY_KEY, stored)) await deleteAllPushSubscriptions()
}

async function loadKeys() {
  const stored = await getConfigValue(VAPID_PRIVATE_KEY_KEY)
  const keys = stored === null ? null : decodeKeys(stored)
  if (keys) return keys

  if (stored !== null) await discardUnreadableKeys(stored)
  await insertConfigValueIfAbsent(VAPID_PRIVATE_KEY_KEY, generatePrivateKey())

  const created = decodeKeys(await getConfigValue(VAPID_PRIVATE_KEY_KEY))
  if (!created) throw new Error('The VAPID key could not be stored.')

  return created
}

function cacheKeys(keys) {
  cache = { keys, expiresAt: Date.now() + CACHE_TTL_MS }
  return keys
}

async function getVapidKeys() {
  if (cache && cache.expiresAt > Date.now()) return cache.keys

  pending ??= loadKeys()
    .then(cacheKeys)
    .finally(() => {
      pending = null
    })

  return pending
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString(ENCODING)
}

function vapidSubject() {
  return config.publicUrl.startsWith(HTTPS_PREFIX) ? config.publicUrl : FALLBACK_SUBJECT
}

function buildVapidToken(endpoint, privateKey) {
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / MS_PER_SECOND) + JWT_TTL_SECONDS,
    sub: vapidSubject(),
  }
  const unsigned = `${encodeJson(JWT_HEADER)}.${encodeJson(claims)}`
  const signature = sign(SIGNATURE_DIGEST, Buffer.from(unsigned), { key: privateKey, dsaEncoding: SIGNATURE_ENCODING })

  return `${unsigned}.${signature.toString(ENCODING)}`
}

export async function getVapidPublicKey() {
  const { publicKey } = await getVapidKeys()

  return publicKey
}

export async function buildVapidAuthorization(endpoint) {
  const { privateKey, publicKey } = await getVapidKeys()

  return `vapid t=${buildVapidToken(endpoint, privateKey)}, k=${publicKey}`
}

export function _resetVapidKeysCacheForTests() {
  cache = null
  pending = null
}
