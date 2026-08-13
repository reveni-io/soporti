import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { equalsConstantTime, generateSecret, hashSecret } from './secrets.js'

describe('generateSecret', () => {
  it('returns a fresh url-safe secret on every call', () => {
    const first = generateSecret()
    const second = generateSecret()

    expect(first).not.toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('hashSecret', () => {
  it('is the sha256 hex digest of the value', () => {
    expect(hashSecret('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})

describe('equalsConstantTime', () => {
  it('compares equal strings as equal', () => {
    expect(equalsConstantTime('same-value', 'same-value')).toBe(true)
  })

  it('rejects different strings, different lengths and non-strings', () => {
    expect(equalsConstantTime('a-value', 'b-value')).toBe(false)
    expect(equalsConstantTime('short', 'much-longer')).toBe(false)
    expect(equalsConstantTime('value', undefined)).toBe(false)
  })
})
