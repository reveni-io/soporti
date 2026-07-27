import { describe, it, expect } from 'vitest'
import { computeNextRun, isValidTimezone } from './next-run.js'

const MADRID = 'Europe/Madrid'
const KOLKATA = 'Asia/Kolkata'

function madridSchedule(overrides) {
  return { timezone: MADRID, minute: 0, hour: null, weekday: null, monthDay: null, ...overrides }
}

describe('computeNextRun', () => {
  describe('hourly', () => {
    it('returns the next occurrence of the minute within the same hour', () => {
      const schedule = madridSchedule({ frequency: 'hourly', minute: 30 })

      const next = computeNextRun(schedule, new Date('2026-03-10T08:05:00Z'))

      expect(next.toISOString()).toBe('2026-03-10T08:30:00.000Z')
    })

    it('rolls over to the next hour once the minute has passed', () => {
      const schedule = madridSchedule({ frequency: 'hourly', minute: 30 })

      const next = computeNextRun(schedule, new Date('2026-03-10T08:30:00Z'))

      expect(next.toISOString()).toBe('2026-03-10T09:30:00.000Z')
    })

    it('honours a time zone with a half-hour offset', () => {
      const schedule = { ...madridSchedule({ frequency: 'hourly', minute: 15 }), timezone: KOLKATA }

      const next = computeNextRun(schedule, new Date('2026-03-10T08:00:00Z'))

      expect(next.toISOString()).toBe('2026-03-10T08:45:00.000Z')
    })
  })

  describe('daily', () => {
    it('returns today at the local time when it is still ahead', () => {
      const schedule = madridSchedule({ frequency: 'daily', hour: 9, minute: 0 })

      const next = computeNextRun(schedule, new Date('2026-03-10T06:00:00Z'))

      expect(next.toISOString()).toBe('2026-03-10T08:00:00.000Z')
    })

    it('returns tomorrow at the local time once it has passed', () => {
      const schedule = madridSchedule({ frequency: 'daily', hour: 9, minute: 0 })

      const next = computeNextRun(schedule, new Date('2026-03-10T08:00:00Z'))

      expect(next.toISOString()).toBe('2026-03-11T08:00:00.000Z')
    })

    it('keeps the local wall time across a daylight-saving change', () => {
      const schedule = madridSchedule({ frequency: 'daily', hour: 9, minute: 0 })

      const next = computeNextRun(schedule, new Date('2026-03-28T09:00:00Z'))

      expect(next.toISOString()).toBe('2026-03-29T07:00:00.000Z')
    })

    it('does not skip a day when the daylight-saving change happens overnight', () => {
      const schedule = madridSchedule({ frequency: 'daily', hour: 23, minute: 30 })

      const next = computeNextRun(schedule, new Date('2026-03-28T22:35:00Z'))

      expect(next.toISOString()).toBe('2026-03-29T21:30:00.000Z')
    })

    it('moves a local time that does not exist forward past the gap', () => {
      const schedule = madridSchedule({ frequency: 'daily', hour: 2, minute: 30 })

      const next = computeNextRun(schedule, new Date('2026-03-28T23:00:00Z'))

      expect(next.toISOString()).toBe('2026-03-29T01:30:00.000Z')
    })
  })

  describe('weekly', () => {
    it('returns the coming weekday at the local time', () => {
      const schedule = madridSchedule({ frequency: 'weekly', weekday: 1, hour: 8, minute: 30 })

      const next = computeNextRun(schedule, new Date('2026-07-22T10:00:00Z'))

      expect(next.toISOString()).toBe('2026-07-27T06:30:00.000Z')
    })

    it('returns today when the weekday matches and the time is still ahead', () => {
      const schedule = madridSchedule({ frequency: 'weekly', weekday: 1, hour: 8, minute: 30 })

      const next = computeNextRun(schedule, new Date('2026-07-27T05:00:00Z'))

      expect(next.toISOString()).toBe('2026-07-27T06:30:00.000Z')
    })

    it('jumps a full week when the weekday matches but the time has passed', () => {
      const schedule = madridSchedule({ frequency: 'weekly', weekday: 1, hour: 8, minute: 30 })

      const next = computeNextRun(schedule, new Date('2026-07-27T06:30:00Z'))

      expect(next.toISOString()).toBe('2026-08-03T06:30:00.000Z')
    })
  })

  describe('monthly', () => {
    it('returns this month when the day is still ahead', () => {
      const schedule = madridSchedule({ frequency: 'monthly', monthDay: 15, hour: 7, minute: 0 })

      const next = computeNextRun(schedule, new Date('2026-07-10T00:00:00Z'))

      expect(next.toISOString()).toBe('2026-07-15T05:00:00.000Z')
    })

    it('rolls into the next month when the day has passed', () => {
      const schedule = madridSchedule({ frequency: 'monthly', monthDay: 15, hour: 7, minute: 0 })

      const next = computeNextRun(schedule, new Date('2026-07-20T00:00:00Z'))

      expect(next.toISOString()).toBe('2026-08-15T05:00:00.000Z')
    })

    it('rolls from December into January of the next year', () => {
      const schedule = madridSchedule({ frequency: 'monthly', monthDay: 1, hour: 9, minute: 0 })

      const next = computeNextRun(schedule, new Date('2026-12-05T00:00:00Z'))

      expect(next.toISOString()).toBe('2027-01-01T08:00:00.000Z')
    })

    it('lands on the same day of February', () => {
      const schedule = madridSchedule({ frequency: 'monthly', monthDay: 28, hour: 9, minute: 0 })

      const next = computeNextRun(schedule, new Date('2026-02-01T00:00:00Z'))

      expect(next.toISOString()).toBe('2026-02-28T08:00:00.000Z')
    })
  })

  it('never returns an instant equal to the reference time', () => {
    const schedule = madridSchedule({ frequency: 'daily', hour: 10, minute: 0 })
    const from = new Date('2026-07-27T08:00:00Z')

    const next = computeNextRun(schedule, from)

    expect(next.getTime()).toBeGreaterThan(from.getTime())
  })
})

describe('isValidTimezone', () => {
  it('accepts an IANA time zone name', () => {
    expect(isValidTimezone(MADRID)).toBe(true)
  })

  it('rejects an unknown name', () => {
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
  })

  it('rejects a non-string or empty value', () => {
    expect(isValidTimezone(undefined)).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})
