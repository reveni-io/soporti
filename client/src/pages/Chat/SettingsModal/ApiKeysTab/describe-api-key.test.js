import { describe, it, expect } from 'vitest'
import { describeScope, formatLastUsed } from './describe-api-key.js'

describe('describeScope', () => {
  it('reads as unrestricted when the scope is empty', () => {
    expect(describeScope([])).toBe('All sources')
  })

  it('reads as unrestricted when the scope is missing', () => {
    expect(describeScope(undefined)).toBe('All sources')
  })

  it('reads as unrestricted when the scope includes yolo', () => {
    expect(describeScope(['yolo'])).toBe('All sources (YOLO)')
  })

  it('lists the scoped sources', () => {
    expect(describeScope(['reveni-io/soporti', 'integration:notion'])).toBe('reveni-io/soporti, integration:notion')
  })
})

describe('formatLastUsed', () => {
  it('says never for a key that was never used', () => {
    expect(formatLastUsed(null)).toBe('Never used')
  })

  it('formats the timestamp', () => {
    const value = '2026-08-11T10:30:00.000Z'
    expect(formatLastUsed(value)).toBe(
      `Last used ${new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
    )
  })
})
