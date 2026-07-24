import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifySignature({ secret, rawBody, signatureHeader }) {
  if (!secret || !rawBody || typeof signatureHeader !== 'string') return false
  if (!signatureHeader.startsWith('sha256=')) return false

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const expectedBuf = Buffer.from(expected, 'utf8')
  const providedBuf = Buffer.from(signatureHeader, 'utf8')

  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}
