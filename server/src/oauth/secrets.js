import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const SECRET_BYTES = 32

export function generateSecret() {
  return randomBytes(SECRET_BYTES).toString('base64url')
}

export function hashSecret(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function equalsConstantTime(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false

  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false

  return timingSafeEqual(left, right)
}
