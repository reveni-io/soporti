import { describe, it, expect } from 'vitest'
import { describeSchedule, describeSources, formatRunTime } from './describe-schedule.js'

describe('describeSchedule', () => {
  it('describes an hourly schedule by its minute', () => {
    expect(describeSchedule({ frequency: 'hourly', minute: 5, hour: null })).toBe('Hourly at :05')
  })

  it('describes a daily schedule by its local time', () => {
    expect(describeSchedule({ frequency: 'daily', hour: 9, minute: 0 })).toBe('Daily at 09:00')
  })

  it('describes a weekly schedule by its weekday', () => {
    expect(describeSchedule({ frequency: 'weekly', weekday: 1, hour: 8, minute: 30 })).toBe('Weekly on Monday at 08:30')
  })

  it('describes a monthly schedule by its day of the month', () => {
    expect(describeSchedule({ frequency: 'monthly', monthDay: 15, hour: 7, minute: 0 })).toBe(
      'Monthly on day 15 at 07:00'
    )
  })
})

describe('describeSources', () => {
  it('names the yolo selection', () => {
    expect(describeSources(['yolo'])).toBe('YOLO (auto)')
  })

  it('lists the selected sources', () => {
    expect(describeSources(['reveni-io/soporti', 'integration:notion'])).toBe('reveni-io/soporti, integration:notion')
  })

  it('reports an empty selection', () => {
    expect(describeSources([])).toBe('no sources')
    expect(describeSources(undefined)).toBe('no sources')
  })
})

describe('formatRunTime', () => {
  it('formats a timestamp for display', () => {
    expect(formatRunTime('2026-07-28T07:00:00.000Z')).toContain('2026')
  })

  it('returns an empty string when there is no timestamp', () => {
    expect(formatRunTime(null)).toBe('')
  })
})
