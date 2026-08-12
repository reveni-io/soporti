import { describe, it, expect, vi, beforeEach } from 'vitest'

const getGranolaApiKey = vi.fn()
const isGranolaConfigured = vi.fn()
vi.mock('./settings.js', () => ({ getGranolaApiKey, isGranolaConfigured }))

const { searchNotes, getNote, isConfigured } = await import('./client.js')

const API_KEY = 'grn_dGVzdGtleTEyMzQ1Njc4OTA'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }
}

function noteRow(id, title, ownerEmail = 'me@example.com') {
  return {
    id,
    title,
    owner: { name: 'Me', email: ownerEmail },
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T11:00:00Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getGranolaApiKey.mockResolvedValue(API_KEY)
  global.fetch = vi.fn()
})

describe('searchNotes', () => {
  it('sends the personal key of the requesting user', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ notes: [], hasMore: false, cursor: null }))

    await searchNotes(7, { query: 'acme' })

    expect(getGranolaApiKey).toHaveBeenCalledWith(7)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('https://public-api.granola.ai/v1/notes')
    expect(options.headers.Authorization).toBe(`Bearer ${API_KEY}`)
  })

  it('matches the query against titles and owners', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        notes: [noteRow('not_1', 'Acme pricing call'), noteRow('not_2', 'Standup'), noteRow('not_3', 'Retro')],
        hasMore: false,
        cursor: null,
      })
    )

    const result = await searchNotes(7, { query: 'acme' })

    expect(result.notes).toEqual([
      {
        id: 'not_1',
        title: 'Acme pricing call',
        owner: 'me@example.com',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ])
    expect(result.scanned).toBe(3)
  })

  it('returns the most recent notes when the query is empty', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ notes: [noteRow('not_1', 'Standup'), noteRow('not_2', 'Retro')], hasMore: false, cursor: null })
    )

    const result = await searchNotes(7, {})

    expect(result.notes).toHaveLength(2)
  })

  it('forwards the date filters', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ notes: [], hasMore: false, cursor: null }))

    await searchNotes(7, { createdAfter: '2026-07-01', createdBefore: '2026-08-01' })

    const url = global.fetch.mock.calls[0][0]
    expect(url).toContain('created_after=2026-07-01')
    expect(url).toContain('created_before=2026-08-01')
  })

  it('asks for no more rows than an unfiltered search can use', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ notes: [], hasMore: false, cursor: null }))

    await searchNotes(7, { limit: 5 })

    expect(global.fetch.mock.calls[0][0]).toContain('page_size=5')
  })

  it('asks for a full page when the query has to be matched against many notes', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ notes: [], hasMore: false, cursor: null }))

    await searchNotes(7, { query: 'acme', limit: 5 })

    expect(global.fetch.mock.calls[0][0]).toContain('page_size=30')
  })

  it('follows the cursor until it has enough matches', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ notes: [noteRow('not_1', 'Standup')], hasMore: true, cursor: 'c1' }))
      .mockResolvedValueOnce(jsonResponse({ notes: [noteRow('not_2', 'Acme call')], hasMore: false, cursor: null }))

    const result = await searchNotes(7, { query: 'acme' })

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[1][0]).toContain('cursor=c1')
    expect(result.notes.map(n => n.id)).toEqual(['not_2'])
    expect(result.scanned).toBe(2)
  })

  it('stops paging once the limit is reached', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ notes: [noteRow('not_1', 'Acme one'), noteRow('not_2', 'Acme two')], hasMore: true, cursor: 'c1' })
    )

    const result = await searchNotes(7, { query: 'acme', limit: 1 })

    expect(result.notes).toHaveLength(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('caps the page count so a broad query cannot walk the whole account', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ notes: [noteRow('not_1', 'Standup')], hasMore: true, cursor: 'c1' }))

    const result = await searchNotes(7, { query: 'nothing-matches-this' })

    expect(global.fetch).toHaveBeenCalledTimes(4)
    expect(result.notes).toEqual([])
    expect(result.truncated).toBe(true)
  })

  it('fails with a connect message when the user has no key', async () => {
    getGranolaApiKey.mockResolvedValue(null)

    await expect(searchNotes(7, {})).rejects.toThrow(/Settings → Connections/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('explains that the key was rejected on a 401', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, 401))

    await expect(searchNotes(7, {})).rejects.toThrow(/revoked or expired/)
  })
})

describe('getNote', () => {
  const fullNote = {
    id: 'not_1',
    title: 'Acme pricing call',
    web_url: 'https://granola.ai/notes/not_1',
    owner: { name: 'Me', email: 'me@example.com' },
    created_at: '2026-08-01T10:00:00Z',
    attendees: [{ email: 'buyer@acme.com' }, { name: 'No Email' }],
    calendar_event: { event_title: 'Acme <> Us', scheduled_start_time: '2026-08-01T10:00:00Z' },
    summary_markdown: '## Agreed\n- 20% discount',
    summary_text: 'Agreed 20% discount',
  }

  it('returns the summary, attendees and url without asking for the transcript', async () => {
    global.fetch.mockResolvedValue(jsonResponse(fullNote))

    const note = await getNote(7, 'not_1')

    expect(global.fetch.mock.calls[0][0]).toBe('https://public-api.granola.ai/v1/notes/not_1')
    expect(note).toMatchObject({
      id: 'not_1',
      title: 'Acme pricing call',
      url: 'https://granola.ai/notes/not_1',
      attendees: ['buyer@acme.com', 'No Email'],
      meetingTitle: 'Acme <> Us',
      summary: '## Agreed\n- 20% discount',
      transcript: null,
    })
  })

  it('requests the transcript only when asked', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ ...fullNote, transcript: [{ speaker: 'Me', text: 'Hello', start_time: 0 }] })
    )

    const note = await getNote(7, 'not_1', { includeTranscript: true })

    expect(global.fetch.mock.calls[0][0]).toBe('https://public-api.granola.ai/v1/notes/not_1?include=transcript')
    expect(note.transcript).toEqual([{ speaker: 'Me', text: 'Hello', startTime: 0 }])
  })

  it('falls back to the summary with a notice when the transcript is too large', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ error: 'TRANSCRIPT_TOO_LARGE' }, 413))
      .mockResolvedValueOnce(jsonResponse(fullNote))

    const note = await getNote(7, 'not_1', { includeTranscript: true })

    expect(note.notice).toMatch(/too large/)
    expect(note.summary).toBe('## Agreed\n- 20% discount')
    expect(note.transcript).toBeNull()
  })

  it('warns through the same notice when the transcript is capped', async () => {
    const entries = Array.from({ length: 501 }, (_, i) => ({ speaker: 'Me', text: `line ${i}`, start_time: i }))
    global.fetch.mockResolvedValue(jsonResponse({ ...fullNote, transcript: entries }))

    const note = await getNote(7, 'not_1', { includeTranscript: true })

    expect(note.transcript).toHaveLength(500)
    expect(note.notice).toMatch(/first 500 transcript entries/)
  })

  it('leaves out the notice when the whole transcript fits', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ ...fullNote, transcript: [{ speaker: 'Me', text: 'Hello', start_time: 0 }] })
    )

    const note = await getNote(7, 'not_1', { includeTranscript: true })

    expect(note.notice).toBeUndefined()
  })

  it('surfaces other API failures', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'not found' }, 404))

    await expect(getNote(7, 'not_missing')).rejects.toThrow(/failed \(404\)/)
  })
})

describe('isConfigured', () => {
  it('delegates to the per-user check', async () => {
    isGranolaConfigured.mockResolvedValue(true)

    expect(await isConfigured(7)).toBe(true)
    expect(isGranolaConfigured).toHaveBeenCalledWith(7)
  })
})
