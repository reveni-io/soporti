import { describe, it, expect } from 'vitest'
import { parseScheduleTiming } from './timing.js'

describe('parseScheduleTiming', () => {
  it('keeps only the minute of an hourly schedule', () => {
    expect(parseScheduleTiming({ frequency: 'hourly', minute: 15, hour: 9, weekday: 2, monthDay: 3 })).toEqual({
      value: { minute: 15, hour: null, weekday: null, monthDay: null },
    })
  })

  it('keeps the hour of a daily schedule and drops the day fields', () => {
    expect(parseScheduleTiming({ frequency: 'daily', minute: 0, hour: 9, weekday: 2, monthDay: 3 })).toEqual({
      value: { minute: 0, hour: 9, weekday: null, monthDay: null },
    })
  })

  it('keeps the weekday of a weekly schedule', () => {
    expect(parseScheduleTiming({ frequency: 'weekly', minute: 30, hour: 8, weekday: 1 })).toEqual({
      value: { minute: 30, hour: 8, weekday: 1, monthDay: null },
    })
  })

  it('keeps the day of the month of a monthly schedule', () => {
    expect(parseScheduleTiming({ frequency: 'monthly', minute: 0, hour: 7, monthDay: 28 })).toEqual({
      value: { minute: 0, hour: 7, weekday: null, monthDay: 28 },
    })
  })

  it('requires an hour for any frequency other than hourly', () => {
    expect(parseScheduleTiming({ frequency: 'weekdays', minute: 0, hour: null })).toEqual({
      error: 'Hour must be an integer between 0 and 23.',
    })
  })

  it('rejects a minute out of range, a fraction or a value that is not a number', () => {
    for (const minute of [60, -1, 1.5, '5', null]) {
      expect(parseScheduleTiming({ frequency: 'hourly', minute })).toEqual({
        error: 'Minute must be an integer between 0 and 59.',
      })
    }
  })

  it('rejects a weekday out of range', () => {
    expect(parseScheduleTiming({ frequency: 'weekly', minute: 0, hour: 9, weekday: 7 }).error).toMatch(/weekday/i)
  })

  it('rejects a day of the month past the 28th', () => {
    expect(parseScheduleTiming({ frequency: 'monthly', minute: 0, hour: 9, monthDay: 31 }).error).toMatch(
      /between 1 and 28/
    )
  })
})
