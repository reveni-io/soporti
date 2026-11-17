import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getGoogleAccessToken = vi.fn()
const invalidateGoogleAccessToken = vi.fn()
const isGoogleCalendarConfigured = vi.fn()
vi.mock('../google-workspace/settings.js', () => ({
  getGoogleAccessToken,
  invalidateGoogleAccessToken,
  isGoogleCalendarConfigured,
}))

const { listEvents, queryFreeBusy, isConfigured } = await import('./client.js')

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }
}

function requestedUrl(index = 0) {
  return new URL(global.fetch.mock.calls[index][0])
}

beforeEach(() => {
  vi.clearAllMocks()
  getGoogleAccessToken.mockResolvedValue('ya29.token')
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('listEvents', () => {
  it('lists single occurrences in start order within the window, in the requested zone', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ timeZone: 'Europe/Madrid', items: [] }))

    const result = await listEvents(7, {
      timeMin: '2026-11-17T23:00:00.000Z',
      timeMax: '2026-11-18T23:00:00.000Z',
      query: 'Acme',
      maxResults: 10,
      timeZone: 'Europe/Madrid',
    })

    const url = requestedUrl()
    expect(url.pathname).toBe('/calendar/v3/calendars/primary/events')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '10',
      timeMin: '2026-11-17T23:00:00.000Z',
      timeMax: '2026-11-18T23:00:00.000Z',
      timeZone: 'Europe/Madrid',
      q: 'Acme',
    })
    expect(getGoogleAccessToken).toHaveBeenCalledWith(7)
    expect(result).toEqual({ calendarTimeZone: 'Europe/Madrid', timeZone: 'Europe/Madrid', events: [], hasMore: false })
  })

  it('starts from now and caps the limit when no window is given', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T10:00:00Z'), toFake: ['Date'] })
    global.fetch.mockResolvedValue(jsonResponse({ items: [], nextPageToken: 'next' }))

    const result = await listEvents(7, { maxResults: 500, calendarId: 'ana@acme.com' })

    const url = requestedUrl()
    expect(url.pathname).toBe('/calendar/v3/calendars/ana%40acme.com/events')
    expect(url.searchParams.get('timeMin')).toBe('2026-11-17T10:00:00.000Z')
    expect(url.searchParams.has('timeMax')).toBe(false)
    expect(url.searchParams.has('q')).toBe(false)
    expect(url.searchParams.get('maxResults')).toBe('100')
    expect(result.hasMore).toBe(true)
  })

  it('keeps what matters about each event and drops what does not', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        timeZone: 'Europe/Madrid',
        items: [
          {
            id: 'ev1',
            status: 'confirmed',
            eventType: 'default',
            summary: 'Acme pricing',
            start: { dateTime: '2026-11-18T09:00:00Z' },
            end: { dateTime: '2026-11-18T09:30:00Z' },
            location: 'Room 2',
            organizer: { email: 'ana@acme.com', displayName: 'Ana' },
            attendees: [
              { email: 'ana@acme.com', displayName: 'Ana', responseStatus: 'accepted', organizer: true },
              { email: 'me@soporti.dev', responseStatus: 'tentative', self: true },
              { email: 'room-2@resource.calendar.google.com', responseStatus: 'accepted', resource: true },
            ],
            hangoutLink: 'https://meet.google.com/abc-defg-hij',
            description: '<p>Agenda: <b>pricing</b></p>',
            htmlLink: 'https://www.google.com/calendar/event?eid=ev1',
          },
        ],
      })
    )

    const [event] = (await listEvents(7, { timeZone: 'Europe/Madrid' })).events

    expect(event).toEqual({
      id: 'ev1',
      summary: 'Acme pricing',
      start: '2026-11-18T10:00:00+01:00',
      end: '2026-11-18T10:30:00+01:00',
      location: 'Room 2',
      organizer: 'ana@acme.com',
      myResponse: 'tentative',
      attendees: [
        { email: 'ana@acme.com', name: 'Ana', responseStatus: 'accepted' },
        { email: 'me@soporti.dev', responseStatus: 'tentative', self: true },
      ],
      meetLink: 'https://meet.google.com/abc-defg-hij',
      description: 'Agenda: pricing',
      htmlLink: 'https://www.google.com/calendar/event?eid=ev1',
    })
  })

  it('marks all-day, tentative and special events and finds a video link in the conference data', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 'ev2',
            status: 'tentative',
            eventType: 'outOfOffice',
            start: { date: '2026-11-18' },
            end: { date: '2026-11-19' },
            conferenceData: {
              entryPoints: [
                { entryPointType: 'phone', uri: 'tel:+34' },
                { entryPointType: 'video', uri: 'https://zoom.us/j/1' },
              ],
            },
          },
        ],
      })
    )

    const [event] = (await listEvents(7, {})).events

    expect(event).toEqual({
      id: 'ev2',
      summary: '(no title)',
      start: '2026-11-18',
      end: '2026-11-19',
      allDay: true,
      type: 'outOfOffice',
      status: 'tentative',
      meetLink: 'https://zoom.us/j/1',
    })
  })

  it('caps long descriptions and large guest lists', async () => {
    const attendees = Array.from({ length: 25 }, (_, index) => ({ email: `p${index}@acme.com` }))
    global.fetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 'ev3',
            summary: 'All hands',
            start: { dateTime: '2026-11-18T09:00:00Z' },
            end: { dateTime: '2026-11-18T10:00:00Z' },
            attendees,
            description: 'y'.repeat(800),
          },
        ],
      })
    )

    const [event] = (await listEvents(7, {})).events

    expect(event.attendees).toHaveLength(20)
    expect(event.attendeesOmitted).toBe(5)
    expect(event.myResponse).toBeUndefined()
    expect(event.description).toHaveLength(501)
  })
})

describe('queryFreeBusy', () => {
  const WINDOW = { timeMin: '2026-11-18T08:00:00.000Z', timeMax: '2026-11-18T17:00:00.000Z' }

  it('checks the user only when no email is given', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ calendars: { primary: { busy: [] } } }))

    const result = await queryFreeBusy(7, { ...WINDOW, timeZone: 'Europe/Madrid' })

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('https://www.googleapis.com/calendar/v3/freeBusy')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ ...WINDOW, timeZone: 'Europe/Madrid', items: [{ id: 'primary' }] })
    expect(result).toEqual({
      timeZone: 'Europe/Madrid',
      timeMin: '2026-11-18T09:00:00+01:00',
      timeMax: '2026-11-18T18:00:00+01:00',
      calendars: [{ calendar: 'primary', busy: [] }],
      freeForAll: [{ start: '2026-11-18T09:00:00+01:00', end: '2026-11-18T18:00:00+01:00' }],
    })
  })

  it('finds the gaps when everyone who answered is free and flags who could not be checked', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        calendars: {
          primary: {
            busy: [
              { start: '2026-11-18T10:00:00Z', end: '2026-11-18T11:00:00Z' },
              { start: '2026-11-18T15:00:00Z', end: '2026-11-18T18:00:00Z' },
            ],
          },
          'ana@acme.com': {
            busy: [
              { start: '2026-11-18T07:00:00Z', end: '2026-11-18T09:00:00Z' },
              { start: '2026-11-18T10:30:00Z', end: '2026-11-18T12:00:00Z' },
            ],
          },
          'bob@other.com': { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] },
        },
      })
    )

    const result = await queryFreeBusy(7, {
      ...WINDOW,
      emails: ['primary', 'ana@acme.com', 'bob@other.com', 'ghost@acme.com'],
      timeZone: 'UTC',
    })

    expect(result.calendars).toEqual([
      {
        calendar: 'primary',
        busy: [
          { start: '2026-11-18T10:00:00+00:00', end: '2026-11-18T11:00:00+00:00' },
          { start: '2026-11-18T15:00:00+00:00', end: '2026-11-18T18:00:00+00:00' },
        ],
      },
      {
        calendar: 'ana@acme.com',
        busy: [
          { start: '2026-11-18T07:00:00+00:00', end: '2026-11-18T09:00:00+00:00' },
          { start: '2026-11-18T10:30:00+00:00', end: '2026-11-18T12:00:00+00:00' },
        ],
      },
      { calendar: 'bob@other.com', error: 'notFound' },
      { calendar: 'ghost@acme.com', error: 'notFound' },
    ])
    expect(result.freeForAll).toEqual([
      { start: '2026-11-18T09:00:00+00:00', end: '2026-11-18T10:00:00+00:00' },
      { start: '2026-11-18T12:00:00+00:00', end: '2026-11-18T15:00:00+00:00' },
    ])
  })

  it('gives no common free time when no calendar could be checked', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ calendars: { 'bob@other.com': { errors: [{ reason: 'notFound' }] } } })
    )

    const result = await queryFreeBusy(7, { ...WINDOW, emails: ['bob@other.com'] })

    expect(result.freeForAll).toBeNull()
  })
})

describe('isConfigured', () => {
  it('delegates to the stored Google connection of the user', async () => {
    isGoogleCalendarConfigured.mockResolvedValue(false)

    expect(await isConfigured(7)).toBe(false)
    expect(isGoogleCalendarConfigured).toHaveBeenCalledWith(7)
  })
})
