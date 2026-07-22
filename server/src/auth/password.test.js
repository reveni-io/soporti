import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, validatePassword, DUMMY_HASH } from './password.js'

describe('password', () => {
  it('hashes and verifies a matching password', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(hash).not.toBe('correct horse battery')
    expect(await verifyPassword('correct horse battery', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('produces unique hashes for the same password (random salt)', async () => {
    const a = await hashPassword('same password')
    const b = await hashPassword('same password')
    expect(a).not.toBe(b)
  })

  it('exposes a dummy hash that never matches a real password', async () => {
    expect(typeof DUMMY_HASH).toBe('string')
    expect(await verifyPassword('anything', DUMMY_HASH)).toBe(false)
  })

  describe('validatePassword', () => {
    it('accepts a password within bounds', () => {
      expect(validatePassword('12345678')).toBeNull()
      expect(validatePassword('a'.repeat(72))).toBeNull()
    })

    it('rejects short, long and non-string passwords', () => {
      expect(validatePassword('1234567')).toMatch(/at least 8/)
      expect(validatePassword('a'.repeat(73))).toMatch(/at most 72/)
      expect(validatePassword(undefined)).toMatch(/at least 8/)
      expect(validatePassword(12345678)).toMatch(/at least 8/)
    })
  })
})
