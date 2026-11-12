import { describe, it, expect } from 'vitest'
import { describeDataAge, formatExactTime } from './data-age.js'

const NOW = new Date(2026, 10, 14, 9, 30, 0)

function ago({ days = 0, hours = 0, minutes = 0, seconds = 0 }) {
  const elapsedSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds

  return new Date(NOW.getTime() - elapsedSeconds * 1000).toISOString()
}

describe('data-age', () => {
  describe('describeDataAge', () => {
    it.each([
      ['the same instant', {}, 'Updated just now'],
      ['59 seconds', { seconds: 59 }, 'Updated just now'],
      ['exactly a minute', { minutes: 1 }, 'Updated 1 min ago'],
      ['3 minutes and a half', { minutes: 3, seconds: 30 }, 'Updated 3 min ago'],
      ['59 minutes and 59 seconds', { minutes: 59, seconds: 59 }, 'Updated 59 min ago'],
      ['exactly an hour', { hours: 1 }, 'Updated 1 h ago'],
      ['2 hours and 40 minutes', { hours: 2, minutes: 40 }, 'Updated 2 h ago'],
      ['a second short of a day', { hours: 23, minutes: 59, seconds: 59 }, 'Updated 23 h ago'],
      ['exactly a day', { days: 1 }, 'Updated Nov 13'],
      ['two days', { days: 2 }, 'Updated Nov 12'],
      ['six weeks', { days: 42 }, 'Updated Oct 3'],
    ])('describes data read %s ago', (_label, elapsed, expected) => {
      expect(describeDataAge(ago(elapsed), NOW)).toBe(expected)
    })

    it('accepts the current time as a timestamp too', () => {
      expect(describeDataAge(ago({ minutes: 12 }), NOW.getTime())).toBe('Updated 12 min ago')
    })

    it('treats a reading slightly ahead of the local clock as just now', () => {
      const ahead = new Date(NOW.getTime() + 20_000).toISOString()

      expect(describeDataAge(ahead, NOW)).toBe('Updated just now')
    })
  })

  describe('formatExactTime', () => {
    it('gives the local date and time of the reading', () => {
      const fetchedAt = new Date(2026, 10, 12, 15, 4, 0)

      expect(formatExactTime(fetchedAt.toISOString())).toBe(
        fetchedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      )
      expect(formatExactTime(fetchedAt.toISOString())).toContain('2026')
    })
  })
})
