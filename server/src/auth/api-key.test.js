import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { API_KEY_PREFIX, generateApiKey, hashApiKey, isApiKeyToken } from './api-key.js'

describe('isApiKeyToken', () => {
  it('recognizes a token carrying the API key prefix', () => {
    expect(isApiKeyToken('sop_abc123')).toBe(true)
  })

  it('rejects a JWT-looking token', () => {
    expect(isApiKeyToken('eyJhbGciOiJIUzI1NiJ9.e30.abc')).toBe(false)
  })

  it('rejects a non-string token', () => {
    expect(isApiKeyToken(undefined)).toBe(false)
  })
})

describe('hashApiKey', () => {
  it('returns the SHA-256 hex digest of the key', () => {
    expect(hashApiKey('sop_secret')).toBe(createHash('sha256').update('sop_secret').digest('hex'))
  })
})

describe('generateApiKey', () => {
  it('returns a prefixed key whose hash matches the plaintext', () => {
    const { key, keyHash } = generateApiKey()

    expect(key.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(key.length).toBeGreaterThan(API_KEY_PREFIX.length + 20)
    expect(keyHash).toBe(hashApiKey(key))
  })

  it('exposes only the first 8 secret characters as the visible prefix', () => {
    const { key, prefix } = generateApiKey()

    expect(prefix).toBe(key.slice(0, API_KEY_PREFIX.length + 8))
    expect(key.startsWith(prefix)).toBe(true)
    expect(prefix.length).toBeLessThan(key.length)
  })

  it('never repeats a key', () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().key))
    expect(keys.size).toBe(50)
  })
})
