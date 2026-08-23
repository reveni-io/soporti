import { describe, it, expect } from 'vitest'
import { formatUpdatedAt } from './format-updated-at.js'

describe('formatUpdatedAt', () => {
  it('prefixes the formatted date', () => {
    expect(formatUpdatedAt('2026-08-20T10:00:00Z')).toMatch(/^Updated /)
  })

  it('includes the year so an old artifact is not mistaken for a recent one', () => {
    expect(formatUpdatedAt('2026-08-20T10:00:00Z')).toContain('2026')
  })

  it('falls back to a readable label when there is no date', () => {
    expect(formatUpdatedAt(null)).toBe('Unknown date')
    expect(formatUpdatedAt(undefined)).toBe('Unknown date')
    expect(formatUpdatedAt('')).toBe('Unknown date')
  })
})
