import { ECDH } from 'node:crypto'

const MAX_ENDPOINT_LENGTH = 2048
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'jmt17.google.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
]
const HTTPS_PROTOCOL = 'https:'
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/
const ENCODING = 'base64url'
const CURVE = 'prime256v1'
const PUBLIC_KEY_BYTES = 65
const UNCOMPRESSED_POINT_PREFIX = 0x04
const AUTH_SECRET_BYTES = 16
const ENDPOINT_ERROR = '"endpoint" must be the https URL of a known push service.'

function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isPushServiceHost(hostname) {
  return PUSH_SERVICE_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`))
}

function isPushServiceUrl(url) {
  if (!url || url.protocol !== HTTPS_PROTOCOL) return false
  if (url.username || url.password || url.port) return false

  return isPushServiceHost(url.hostname)
}

function decodeKey(value, length) {
  if (typeof value !== 'string' || !BASE64URL_RE.test(value)) return null

  const bytes = Buffer.from(value, ENCODING)
  return bytes.length === length ? bytes : null
}

function isCurvePoint(bytes) {
  try {
    ECDH.convertKey(bytes, CURVE)
    return true
  } catch {
    return false
  }
}

function isPublicKey(value) {
  const bytes = decodeKey(value, PUBLIC_KEY_BYTES)

  return Boolean(bytes) && bytes[0] === UNCOMPRESSED_POINT_PREFIX && isCurvePoint(bytes)
}

export function parseEndpoint(value) {
  if (typeof value !== 'string' || value.length === 0) return { error: '"endpoint" must be a non-empty string.' }
  if (value.length > MAX_ENDPOINT_LENGTH) {
    return { error: `"endpoint" is too long (max ${MAX_ENDPOINT_LENGTH} characters).` }
  }

  return { value }
}

export function parsePushSubscription({ endpoint, p256dh, auth }) {
  const parsedEndpoint = parseEndpoint(endpoint)
  if (parsedEndpoint.error) return parsedEndpoint
  if (!isPushServiceUrl(parseUrl(endpoint))) return { error: ENDPOINT_ERROR }
  if (!isPublicKey(p256dh)) return { error: '"keys.p256dh" must be a base64url P-256 public key of 65 bytes.' }
  if (!decodeKey(auth, AUTH_SECRET_BYTES)) return { error: '"keys.auth" must be a base64url secret of 16 bytes.' }

  return { value: { endpoint, p256dh, auth } }
}
