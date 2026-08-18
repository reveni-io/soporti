import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime } from './dates.js'

describe('formatDate', () => {
  it('renders the date of a valid value', () => {
    expect(formatDate('2026-08-14T09:00:00.000Z')).toBe(new Date('2026-08-14T09:00:00.000Z').toLocaleDateString())
  })

  it('dashes an empty value', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('dashes a value that is not a date', () => {
    expect(formatDate('not-a-date')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('renders the date and the time of a valid value in the app-wide format', () => {
    expect(formatDateTime('2026-08-14T09:00:00.000Z')).toBe(
      new Date('2026-08-14T09:00:00.000Z').toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    )
  })

  it('dashes an empty value', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('dashes a value that is not a date', () => {
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})
