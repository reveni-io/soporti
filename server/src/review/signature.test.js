import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifySignature } from './signature.js'

const SECRET = 'test-webhook-secret'

function sign(body, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

describe('verifySignature', () => {
  it('accepts a valid signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ action: 'labeled' }))
    const signatureHeader = sign(rawBody)
    expect(verifySignature({ secret: SECRET, rawBody, signatureHeader })).toBe(true)
  })

  it('rejects a signature computed with another secret', () => {
    const rawBody = Buffer.from('{"a":1}')
    const signatureHeader = sign(rawBody, 'wrong-secret')
    expect(verifySignature({ secret: SECRET, rawBody, signatureHeader })).toBe(false)
  })

  it('rejects when the body was tampered with', () => {
    const signatureHeader = sign(Buffer.from('{"a":1}'))
    expect(verifySignature({ secret: SECRET, rawBody: Buffer.from('{"a":2}'), signatureHeader })).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(verifySignature({ secret: SECRET, rawBody: Buffer.from('x'), signatureHeader: undefined })).toBe(false)
  })

  it('rejects a header without the sha256= prefix', () => {
    const rawBody = Buffer.from('x')
    const bare = sign(rawBody).slice('sha256='.length)
    expect(verifySignature({ secret: SECRET, rawBody, signatureHeader: bare })).toBe(false)
  })

  it('rejects a header of the wrong length without throwing', () => {
    expect(verifySignature({ secret: SECRET, rawBody: Buffer.from('x'), signatureHeader: 'sha256=abc' })).toBe(false)
  })

  it('rejects when the secret is empty', () => {
    const rawBody = Buffer.from('x')
    expect(verifySignature({ secret: '', rawBody, signatureHeader: sign(rawBody) })).toBe(false)
  })
})
