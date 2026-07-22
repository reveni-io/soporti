import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { announceSetupCode, verifySetupCode, resetSetupCode } from './setup-code.js'

let logSpy

beforeEach(() => {
  resetSetupCode()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
})

function announcedCode() {
  const line = logSpy.mock.calls.at(-1)[0]
  return line.split(': ').at(-1)
}

describe('setup code', () => {
  it('announces a random code and accepts exactly that code', () => {
    announceSetupCode()
    const code = announcedCode()

    expect(code).toMatch(/^[a-f0-9]{32}$/)
    expect(verifySetupCode(code)).toBe(true)
  })

  it('rejects wrong, empty and non-string candidates', () => {
    announceSetupCode()

    expect(verifySetupCode('not-the-code')).toBe(false)
    expect(verifySetupCode('')).toBe(false)
    expect(verifySetupCode(undefined)).toBe(false)
    expect(verifySetupCode(12345)).toBe(false)
  })

  it('announces only once per process', () => {
    announceSetupCode()
    announceSetupCode()

    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('generates a fresh code after a reset (simulates a restart)', () => {
    announceSetupCode()
    const first = announcedCode()

    resetSetupCode()
    announceSetupCode()
    const second = announcedCode()

    expect(second).not.toBe(first)
    expect(verifySetupCode(first)).toBe(false)
    expect(verifySetupCode(second)).toBe(true)
  })

  it('verifies lazily even before any announcement (never matches a guess)', () => {
    expect(verifySetupCode('0'.repeat(32))).toBe(false)
  })
})
