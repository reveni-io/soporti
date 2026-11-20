import { describe, it, expect } from 'vitest'
import { formatTime } from './format-time.js'

describe('formatTime', () => {
  it('shows the date and the time', () => {
    const value = '2026-11-20T10:00:00.000Z'

    expect(formatTime(value)).toBe(new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
  })

  it('shows nothing for a value that is not a date', () => {
    expect(formatTime('not a date')).toBe('')
    expect(formatTime(undefined)).toBe('')
  })
})
