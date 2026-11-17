import { DEFAULT_TIMEZONE } from '../constants.js'
import { googleRequest, toZonedTime } from '../google-workspace/api.js'
import { isGoogleCalendarConfigured } from '../google-workspace/settings.js'
import { stripHtml } from '../integrations/html.js'
import { redactSecrets } from '../review/output-guard.js'

const BASE_URL = 'https://www.googleapis.com/calendar/v3'
const SERVICE = 'Google Calendar'
export const PRIMARY_CALENDAR = 'primary'
export const DEFAULT_EVENT_RESULTS = 25
export const MAX_EVENT_RESULTS = 100
export const MAX_FREE_BUSY_CALENDARS = 10
export const MAX_FREE_BUSY_DAYS = 62
const MAX_DESCRIPTION_CHARS = 500
const MAX_ATTENDEES = 20
const DEFAULT_EVENT_TYPE = 'default'
const CONFIRMED_STATUS = 'confirmed'
const VIDEO_ENTRY_POINT = 'video'
const MISSING_CALENDAR_ERROR = 'notFound'

function toEventTime(time, timeZone) {
  if (!time) return null
  if (time.date) return time.date

  return toZonedTime(time.dateTime, timeZone)
}

function capDescription(description) {
  if (!description) return undefined

  const text = redactSecrets(stripHtml(description))
  if (text.length <= MAX_DESCRIPTION_CHARS) return text

  return `${text.slice(0, MAX_DESCRIPTION_CHARS)}…`
}

function toAttendee(attendee) {
  return {
    email: attendee.email,
    name: attendee.displayName,
    responseStatus: attendee.responseStatus,
    self: attendee.self || undefined,
  }
}

function describeAttendees(event) {
  const people = (event.attendees || []).filter(attendee => !attendee.resource)
  if (people.length === 0) return {}

  return {
    myResponse: people.find(attendee => attendee.self)?.responseStatus,
    attendees: people.slice(0, MAX_ATTENDEES).map(toAttendee),
    attendeesOmitted: people.length > MAX_ATTENDEES ? people.length - MAX_ATTENDEES : undefined,
  }
}

function findMeetLink(event) {
  if (event.hangoutLink) return event.hangoutLink

  return event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === VIDEO_ENTRY_POINT)?.uri
}

function toEvent(event, timeZone) {
  return {
    id: event.id,
    summary: redactSecrets(event.summary || '(no title)'),
    start: toEventTime(event.start, timeZone),
    end: toEventTime(event.end, timeZone),
    allDay: event.start?.date ? true : undefined,
    type: event.eventType === DEFAULT_EVENT_TYPE ? undefined : event.eventType,
    status: event.status === CONFIRMED_STATUS ? undefined : event.status,
    location: event.location,
    organizer: event.organizer?.email,
    ...describeAttendees(event),
    meetLink: findMeetLink(event),
    description: capDescription(event.description),
    htmlLink: event.htmlLink,
  }
}

function buildEventsQuery({ timeMin, timeMax, query, maxResults, timeZone }) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.min(maxResults, MAX_EVENT_RESULTS)),
    timeMin: timeMin ?? new Date().toISOString(),
    timeZone,
  })
  if (timeMax) params.set('timeMax', timeMax)
  if (query) params.set('q', query)

  return params.toString()
}

export async function listEvents(
  userId,
  {
    timeMin = null,
    timeMax = null,
    query = '',
    maxResults = DEFAULT_EVENT_RESULTS,
    calendarId = PRIMARY_CALENDAR,
    timeZone = DEFAULT_TIMEZONE,
  } = {}
) {
  const search = buildEventsQuery({ timeMin, timeMax, query, maxResults, timeZone })
  const data = await googleRequest(userId, `${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${search}`, {
    service: SERVICE,
  })

  return {
    calendarTimeZone: data.timeZone,
    timeZone,
    events: (data.items || []).map(event => toEvent(event, timeZone)),
    hasMore: Boolean(data.nextPageToken),
  }
}

function toBusyBlocks(entry) {
  return (entry.busy || []).map(block => ({ start: Date.parse(block.start), end: Date.parse(block.end) }))
}

function toZonedBlock(block, timeZone) {
  return { start: toZonedTime(block.start, timeZone), end: toZonedTime(block.end, timeZone) }
}

function describeCalendar(id, entry, timeZone) {
  const errors = entry ? entry.errors || [] : [{ reason: MISSING_CALENDAR_ERROR }]
  if (errors.length > 0) return { calendar: id, error: errors.map(error => error.reason).join(', ') }

  return { calendar: id, busy: toBusyBlocks(entry).map(block => toZonedBlock(block, timeZone)) }
}

function findCommonFree(busy, windowStart, windowEnd) {
  const gaps = []
  let cursor = windowStart

  for (const block of [...busy].sort((a, b) => a.start - b.start)) {
    if (block.start > cursor) gaps.push({ start: cursor, end: Math.min(block.start, windowEnd) })
    cursor = Math.max(cursor, block.end)
  }
  if (windowEnd > cursor) gaps.push({ start: cursor, end: windowEnd })

  return gaps.filter(gap => gap.end > gap.start)
}

export async function queryFreeBusy(userId, { emails = [], timeMin, timeMax, timeZone = DEFAULT_TIMEZONE }) {
  const ids = emails.length > 0 ? emails : [PRIMARY_CALENDAR]
  const data = await googleRequest(userId, `${BASE_URL}/freeBusy`, {
    method: 'POST',
    body: { timeMin, timeMax, timeZone, items: ids.map(id => ({ id })) },
    service: SERVICE,
  })

  const entries = ids.map(id => data.calendars?.[id])
  const calendars = ids.map((id, index) => describeCalendar(id, entries[index], timeZone))
  const answered = entries.filter((_entry, index) => !calendars[index].error)
  const free = findCommonFree(answered.flatMap(toBusyBlocks), Date.parse(timeMin), Date.parse(timeMax))

  return {
    timeZone,
    timeMin: toZonedTime(timeMin, timeZone),
    timeMax: toZonedTime(timeMax, timeZone),
    calendars,
    freeForAll: answered.length > 0 ? free.map(block => toZonedBlock(block, timeZone)) : null,
  }
}

export async function isConfigured(userId) {
  return isGoogleCalendarConfigured(userId)
}
