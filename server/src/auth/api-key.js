import { createHash, randomBytes } from 'node:crypto'

export const API_KEY_PREFIX = 'sop_'

const SECRET_BYTES = 24
const VISIBLE_SECRET_LENGTH = 8

export function isApiKeyToken(token) {
  return typeof token === 'string' && token.startsWith(API_KEY_PREFIX)
}

export function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey() {
  const key = `${API_KEY_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`

  return {
    key,
    prefix: key.slice(0, API_KEY_PREFIX.length + VISIBLE_SECRET_LENGTH),
    keyHash: hashApiKey(key),
  }
}
