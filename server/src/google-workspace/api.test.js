import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getGoogleAccessToken = vi.fn()
const invalidateGoogleAccessToken = vi.fn()
vi.mock('./settings.js', () => ({ getGoogleAccessToken, invalidateGoogleAccessToken }))

const { googleRequest, toZonedTime } = await import('./api.js')

const URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }
}

function googleError(status, reason, message) {
  return jsonResponse({ error: { code: status, message, errors: [{ reason }] } }, status)
}

beforeEach(() => {
  vi.clearAllMocks()
  getGoogleAccessToken.mockResolvedValue('ya29.first')
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('googleRequest', () => {
  it('sends the access token of the requesting user and returns the json body', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ messages: [] }))

    const data = await googleRequest(7, URL, { service: 'Gmail' })

    expect(data).toEqual({ messages: [] })
    expect(getGoogleAccessToken).toHaveBeenCalledWith(7)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe(URL)
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe('Bearer ya29.first')
    expect(options.body).toBeUndefined()
  })

  it('posts a json body', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ calendars: {} }))

    await googleRequest(7, URL, { method: 'POST', body: { items: [{ id: 'primary' }] }, service: 'Google Calendar' })

    const [, options] = global.fetch.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ items: [{ id: 'primary' }] })
  })

  it('drops the cached token and retries once with a fresh one after a 401', async () => {
    getGoogleAccessToken.mockResolvedValueOnce('ya29.stale').mockResolvedValueOnce('ya29.fresh')
    global.fetch.mockResolvedValueOnce(jsonResponse({}, 401)).mockResolvedValueOnce(jsonResponse({ ok: 1 }))

    const data = await googleRequest(7, URL, { service: 'Gmail' })

    expect(data).toEqual({ ok: 1 })
    expect(invalidateGoogleAccessToken).toHaveBeenCalledTimes(1)
    expect(invalidateGoogleAccessToken).toHaveBeenCalledWith(7)
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer ya29.fresh')
  })

  it('asks to reconnect when the fresh token is rejected too', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, 401))

    await expect(googleRequest(7, URL, { service: 'Gmail' })).rejects.toThrow(
      'Gmail rejected the Google access. Reconnect Google from Settings → Connections.'
    )
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('surfaces the connection error without calling Google', async () => {
    getGoogleAccessToken.mockRejectedValue(
      new Error('Google is not connected. Connect it from Settings → Connections.')
    )

    await expect(googleRequest(7, URL, { service: 'Gmail' })).rejects.toThrow('Google is not connected')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('explains a missing scope', async () => {
    global.fetch.mockResolvedValue(googleError(403, 'insufficientPermissions', 'Insufficient Permission'))

    await expect(googleRequest(7, URL, { service: 'Gmail' })).rejects.toThrow(
      'Gmail access was not granted. Reconnect Google from Settings → Connections and allow Gmail.'
    )
  })

  it('explains a rate limit', async () => {
    global.fetch.mockResolvedValue(googleError(403, 'userRateLimitExceeded', 'Rate limit'))

    await expect(googleRequest(7, URL, { service: 'Gmail' })).rejects.toThrow('Gmail is rate-limiting requests')
  })

  it('explains an unknown id', async () => {
    global.fetch.mockResolvedValue(googleError(404, 'notFound', 'Requested entity was not found.'))

    await expect(googleRequest(7, URL, { service: 'Gmail' })).rejects.toThrow('Gmail found nothing with that id')
  })

  it('passes on what Google said about a refused request', async () => {
    global.fetch.mockResolvedValue(googleError(400, 'badRequest', 'Bad Request: timeMax before timeMin'))

    await expect(googleRequest(7, URL, { service: 'Google Calendar' })).rejects.toThrow(
      'Google Calendar refused the request (400): Bad Request: timeMax before timeMin'
    )
  })

  it('reports the status of an unexpected failure', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => 'not json' })

    await expect(googleRequest(7, URL, { service: 'Gmail' })).rejects.toThrow('Gmail request failed (503).')
  })

  it('aborts a request that takes too long', async () => {
    vi.useFakeTimers()
    global.fetch.mockImplementation((_url, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    })

    const pending = expect(googleRequest(7, URL, { service: 'Gmail' })).rejects.toThrow('Gmail did not answer in time')
    await vi.advanceTimersByTimeAsync(15_000)

    await pending
  })

  it('passes a network failure through', async () => {
    global.fetch.mockRejectedValue(new Error('ECONNRESET'))

    await expect(googleRequest(7, URL, { service: 'Gmail' })).rejects.toThrow('ECONNRESET')
  })
})

describe('toZonedTime', () => {
  it('expresses an instant in the given zone with its offset', () => {
    expect(toZonedTime('2026-11-18T08:00:00Z', 'Europe/Madrid')).toBe('2026-11-18T09:00:00+01:00')
    expect(toZonedTime(Date.parse('2026-07-01T08:00:00Z'), 'Europe/Madrid')).toBe('2026-07-01T10:00:00+02:00')
  })

  it('leaves a missing or unreadable value as it is', () => {
    expect(toZonedTime(null, 'UTC')).toBeNull()
    expect(toZonedTime(undefined, 'UTC')).toBeUndefined()
    expect(toZonedTime('not a date', 'UTC')).toBe('not a date')
  })
})
