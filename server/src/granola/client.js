import { getGranolaApiKey, isGranolaConfigured } from './settings.js'

const BASE_URL = 'https://public-api.granola.ai/v1'
const REQUEST_TIMEOUT_MS = 15_000
const PAGE_SIZE = 30
const MAX_SEARCH_PAGES = 4
export const DEFAULT_SEARCH_RESULTS = 10
export const MAX_SEARCH_RESULTS = 30
const MAX_TRANSCRIPT_ENTRIES = 500
const NOT_CONNECTED_MESSAGE =
  'Granola is not connected for this user. Connect a personal Granola API key in Settings → Connections.'
const REVOKED_MESSAGE =
  'Granola rejected the API key. It may have been revoked or expired — reconnect it in Settings → Connections.'
const TRANSCRIPT_TOO_LARGE_NOTICE =
  'The transcript is too large to return inline. Only the summary is available — say so instead of quoting.'
const TRANSCRIPT_CAPPED_NOTICE = `Only the first ${MAX_TRANSCRIPT_ENTRIES} transcript entries are included. The rest of the meeting is missing — say so instead of treating this as the whole call.`

class GranolaTranscriptTooLargeError extends Error {}

async function request(userId, path) {
  const apiKey = await getGranolaApiKey(userId)
  if (!apiKey) throw new Error(NOT_CONNECTED_MESSAGE)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (res.status === 401 || res.status === 403) throw new Error(REVOKED_MESSAGE)

    if (!res.ok) {
      const text = await res.text()
      if (res.status === 413) throw new GranolaTranscriptTooLargeError(text)
      throw new Error(`Granola API GET ${path} failed (${res.status}): ${text}`)
    }

    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

function buildListQuery({ cursor, createdAfter, createdBefore, pageSize }) {
  const params = new URLSearchParams({ page_size: String(pageSize) })
  if (cursor) params.set('cursor', cursor)
  if (createdAfter) params.set('created_after', createdAfter)
  if (createdBefore) params.set('created_before', createdBefore)
  return params.toString()
}

function toNoteSummary(note) {
  return {
    id: note.id,
    title: note.title ?? 'Untitled',
    owner: note.owner?.email ?? note.owner?.name ?? null,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  }
}

function matchesQuery(note, terms) {
  if (terms.length === 0) return true

  const haystack = [note.title, note.owner?.name, note.owner?.email].filter(Boolean).join(' ').toLowerCase()
  return terms.every(term => haystack.includes(term))
}

export async function searchNotes(userId, { query = '', createdAfter = null, createdBefore = null, limit } = {}) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 0)
  const max = Math.min(limit || DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS)
  const pageSize = terms.length === 0 ? Math.min(PAGE_SIZE, max) : PAGE_SIZE

  const matches = []
  let cursor = null
  let scanned = 0

  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const data = await request(userId, `/notes?${buildListQuery({ cursor, createdAfter, createdBefore, pageSize })}`)
    const notes = data.notes || []

    scanned += notes.length
    for (const note of notes) {
      if (matches.length >= max) break
      if (matchesQuery(note, terms)) matches.push(toNoteSummary(note))
    }

    cursor = data.hasMore ? (data.cursor ?? null) : null
    if (!cursor || matches.length >= max) break
  }

  return {
    notes: matches,
    scanned,
    truncated: Boolean(cursor) && matches.length < max,
  }
}

function toTranscript(entries) {
  if (!Array.isArray(entries)) return null

  return entries.slice(0, MAX_TRANSCRIPT_ENTRIES).map(entry => ({
    speaker: entry.speaker ?? null,
    text: entry.text ?? '',
    startTime: entry.start_time ?? null,
  }))
}

function resolveNotice(note, notice) {
  if (notice) return notice
  if (Array.isArray(note.transcript) && note.transcript.length > MAX_TRANSCRIPT_ENTRIES) return TRANSCRIPT_CAPPED_NOTICE

  return null
}

function toNote(note, { notice = null } = {}) {
  const resolved = resolveNotice(note, notice)

  return {
    id: note.id,
    title: note.title ?? 'Untitled',
    url: note.web_url ?? null,
    owner: note.owner?.email ?? note.owner?.name ?? null,
    createdAt: note.created_at,
    attendees: (note.attendees || []).map(a => a.email ?? a.name).filter(Boolean),
    meetingTitle: note.calendar_event?.event_title ?? null,
    startedAt: note.calendar_event?.scheduled_start_time ?? null,
    summary: note.summary_markdown ?? note.summary_text ?? '',
    transcript: toTranscript(note.transcript),
    ...(resolved ? { notice: resolved } : {}),
  }
}

export async function getNote(userId, noteId, { includeTranscript = false } = {}) {
  if (!includeTranscript) return toNote(await request(userId, `/notes/${noteId}`))

  try {
    return toNote(await request(userId, `/notes/${noteId}?include=transcript`))
  } catch (err) {
    if (!(err instanceof GranolaTranscriptTooLargeError)) throw err

    const note = await request(userId, `/notes/${noteId}`)
    return toNote(note, { notice: TRANSCRIPT_TOO_LARGE_NOTICE })
  }
}

export async function isConfigured(userId) {
  return isGranolaConfigured(userId)
}
