import { describe, it, expect } from 'vitest'
import { describeRoutineSchedule, describeRunTime, parseRoutineInput } from './routines.js'

const MADRID = 'Europe/Madrid'
const NOW = new Date('2026-11-17T10:00:00Z')

const WEEKDAYS_INPUT = {
  title: '  Ticket triage  ',
  instruction: '  Review the new Zendesk tickets.  ',
  frequency: 'weekdays',
  minute: 0,
  hour: 17,
  weekday: null,
  monthDay: null,
  date: null,
}

function parse(overrides) {
  return parseRoutineInput({ ...WEEKDAYS_INPUT, ...overrides }, { timezone: MADRID, now: NOW })
}

describe('parseRoutineInput', () => {
  it('returns the trimmed routine with its time zone', () => {
    expect(parse()).toEqual({
      value: {
        title: 'Ticket triage',
        instruction: 'Review the new Zendesk tickets.',
        frequency: 'weekdays',
        minute: 0,
        hour: 17,
        weekday: null,
        monthDay: null,
        runDate: null,
        timezone: MADRID,
      },
    })
  })

  it('accepts every frequency of a scheduled query too', () => {
    expect(parse({ frequency: 'hourly', hour: null }).value).toMatchObject({ frequency: 'hourly', hour: null })
    expect(parse({ frequency: 'daily' }).value).toMatchObject({ frequency: 'daily', hour: 17 })
    expect(parse({ frequency: 'weekly', weekday: 5 }).value).toMatchObject({ frequency: 'weekly', weekday: 5 })
    expect(parse({ frequency: 'monthly', monthDay: 1 }).value).toMatchObject({ frequency: 'monthly', monthDay: 1 })
  })

  it('keeps the date of a one-off routine set in the future', () => {
    expect(parse({ frequency: 'once', date: '2026-11-20', hour: 9 }).value).toMatchObject({
      frequency: 'once',
      hour: 9,
      runDate: '2026-11-20',
    })
  })

  it('drops a date given to a routine that is not one-off', () => {
    expect(parse({ date: '2026-11-20' }).value.runDate).toBeNull()
  })

  it('requires a title and an instruction', () => {
    expect(parse({ title: ' ' })).toEqual({ error: 'The title is required.' })
    expect(parse({ instruction: null })).toEqual({ error: 'The instruction is required.' })
  })

  it('limits the title to 80 characters and the instruction to 4000', () => {
    expect(parse({ title: 'x'.repeat(81) })).toEqual({ error: 'The title is too long (max 80 characters).' })
    expect(parse({ instruction: 'x'.repeat(4001) })).toEqual({
      error: 'The instruction is too long (max 4000 characters).',
    })
  })

  it('rejects an unknown frequency', () => {
    expect(parse({ frequency: 'yearly' }).error).toBe(
      'Frequency must be one of: hourly, daily, weekly, monthly, weekdays, once.'
    )
  })

  it('validates the time like a scheduled query', () => {
    expect(parse({ minute: 75 }).error).toMatch(/minute/i)
    expect(parse({ hour: 24 }).error).toMatch(/hour/i)
    expect(parse({ frequency: 'once', date: '2026-11-20', hour: null }).error).toMatch(/hour/i)
  })

  it('requires a date written as YYYY-MM-DD for a one-off routine', () => {
    expect(parse({ frequency: 'once', date: null }).error).toBe('A one-off routine needs a date written as YYYY-MM-DD.')
    expect(parse({ frequency: 'once', date: '20/11/2026' }).error).toBe(
      'A one-off routine needs a date written as YYYY-MM-DD.'
    )
  })

  it('rejects a date that does not exist in the calendar', () => {
    expect(parse({ frequency: 'once', date: '2026-02-30' }).error).toBe('2026-02-30 is not a valid calendar date.')
    expect(parse({ frequency: 'once', date: '2026-13-01' }).error).toBe('2026-13-01 is not a valid calendar date.')
  })

  it('rejects a one-off routine whose moment has already passed in its time zone', () => {
    expect(parse({ frequency: 'once', date: '2026-11-17', hour: 11, minute: 0 }).error).toBe(
      'A one-off routine must be set for a date and time in the future.'
    )
    expect(parse({ frequency: 'once', date: '2026-11-17', hour: 11, minute: 1 }).value.runDate).toBe('2026-11-17')
  })
})

describe('describeRoutineSchedule', () => {
  const base = { minute: 5, hour: 17, weekday: null, monthDay: null, runDate: null, timezone: MADRID }

  it('describes every frequency in words, with its time zone', () => {
    expect(describeRoutineSchedule({ ...base, frequency: 'hourly' })).toBe('every hour at :05 (Europe/Madrid)')
    expect(describeRoutineSchedule({ ...base, frequency: 'daily' })).toBe('every day at 17:05 (Europe/Madrid)')
    expect(describeRoutineSchedule({ ...base, frequency: 'weekdays', minute: 0 })).toBe(
      'every weekday at 17:00 (Europe/Madrid)'
    )
    expect(describeRoutineSchedule({ ...base, frequency: 'weekly', weekday: 1 })).toBe(
      'every Monday at 17:05 (Europe/Madrid)'
    )
    expect(describeRoutineSchedule({ ...base, frequency: 'monthly', monthDay: 15 })).toBe(
      'on day 15 of every month at 17:05 (Europe/Madrid)'
    )
    expect(describeRoutineSchedule({ ...base, frequency: 'once', runDate: '2026-11-20', hour: 9, minute: 0 })).toBe(
      'once on 2026-11-20 at 09:00 (Europe/Madrid)'
    )
  })
})

describe('describeRunTime', () => {
  it('gives the weekday, the local date and the local time in the zone', () => {
    expect(describeRunTime(new Date('2026-11-20T08:00:00Z'), MADRID)).toBe('Friday 2026-11-20 at 09:00 (Europe/Madrid)')
  })

  it('accepts a timestamp string as stored in the database', () => {
    expect(describeRunTime('2026-07-20T15:30:00.000Z', MADRID)).toBe('Monday 2026-07-20 at 17:30 (Europe/Madrid)')
  })
})
