import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getJevApiKey = vi.fn()
vi.mock('./settings.js', () => ({ getJevApiKey }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { askQuestions, listModels, JevApiError } = await import('./client.js')

function mockResponse(data, status = 200) {
  return { ok: status < 400, status, json: async () => data }
}

beforeEach(() => {
  mockFetch.mockReset()
  getJevApiKey.mockResolvedValue('jev-secret')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('listModels', () => {
  it('calls the models endpoint with the stored key and maps the models', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        models: [
          { name: 'jev-latest', description: 'Most recent stable release', release_date: '2026-10-14' },
          { name: 'jev-preview', release_date: '2026-10-14' },
          { description: 'no name' },
        ],
      })
    )

    const models = await listModels()

    expect(models).toEqual([
      { name: 'jev-latest', description: 'Most recent stable release', releaseDate: '2026-10-14' },
      { name: 'jev-preview', description: '', releaseDate: '2026-10-14' },
    ])
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/models')
    expect(options.headers).toEqual({ Authorization: 'Bearer jev-secret' })
  })

  it('returns no models when the response has no list', async () => {
    mockFetch.mockResolvedValue(mockResponse({}))

    expect(await listModels()).toEqual([])
  })

  it('fails without calling Jev when no key is saved', async () => {
    getJevApiKey.mockResolvedValue(null)

    await expect(listModels()).rejects.toThrow(/save the API key in the admin panel/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('reports a rejected key', async () => {
    mockFetch.mockResolvedValue(mockResponse({ detail: 'bad key' }, 401))

    const error = await listModels().catch(err => err)

    expect(error).toBeInstanceOf(JevApiError)
    expect(error.message).toBe('Jev rejected the API key (HTTP 401)')
    expect(error.status).toBe(401)
  })

  it('reports other HTTP errors with their status', async () => {
    mockFetch.mockResolvedValue(mockResponse({}, 529))

    await expect(listModels()).rejects.toThrow('Jev error (HTTP 529)')
  })

  it('reports a timeout', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))

    await expect(listModels()).rejects.toThrow('Jev error (timeout after 15 s)')
  })

  it('reports an unreachable API', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    await expect(listModels()).rejects.toThrow('Jev error (could not reach the API)')
  })
})

describe('askQuestions', () => {
  const QUESTIONS = { q1: { type: 'noul', instructions: { question: 'Is it risky?' }, criteria: null } }

  function ask(timeoutMs = 30_000) {
    return askQuestions({ model: 'jev-latest', state: { diff: '+ a' }, questions: QUESTIONS, timeoutMs })
  }

  it('posts the model, the state and the questions, and returns the model that answered', async () => {
    mockFetch.mockResolvedValue(mockResponse({ model: 'jev-1.14.0', answers: { q1: { type: 'noul', noul: 0.2 } } }))

    const result = await ask()

    expect(result).toEqual({ model: 'jev-1.14.0', answers: { q1: { type: 'noul', noul: 0.2 } } })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ Authorization: 'Bearer jev-secret', 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body)).toEqual({ model: 'jev-latest', state: { diff: '+ a' }, questions: QUESTIONS })
  })

  it.each([
    ['an answer that is not JSON', new SyntaxError('Unexpected token'), 'Jev error (invalid response)'],
    [
      'a body that times out',
      Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
      'Jev error (timeout after 30 s)',
    ],
  ])('fails with a Jev error on %s', async (_case, error, message) => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(error) })

    const failure = ask().catch(err => err)

    expect(await failure).toBeInstanceOf(JevApiError)
    expect((await failure).message).toBe(message)
  })

  it('keeps the requested model when the answer does not name one', async () => {
    mockFetch.mockResolvedValue(mockResponse({}))

    expect(await ask()).toEqual({ model: 'jev-latest', answers: {} })
  })

  it('retries an overloaded or unreachable API with a growing backoff', async () => {
    vi.useFakeTimers()
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 529))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(mockResponse({ model: 'jev-1.14.0', answers: {} }))

    const pending = ask()
    await vi.advanceTimersByTimeAsync(500)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)

    expect(await pending).toEqual({ model: 'jev-1.14.0', answers: {} })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('gives up after three attempts', async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue(mockResponse({}, 429))

    const pending = ask().catch(err => err)
    await vi.advanceTimersByTimeAsync(1500)

    expect((await pending).message).toBe('Jev error (HTTP 429)')
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry a request Jev rejected', async () => {
    mockFetch.mockResolvedValue(mockResponse({ detail: [] }, 422))

    await expect(ask()).rejects.toThrow('Jev error (HTTP 422)')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry when the backoff would pass the timeout', async () => {
    mockFetch.mockResolvedValue(mockResponse({}, 503))

    await expect(ask(400)).rejects.toThrow('Jev error (HTTP 503)')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('reports the timeout of the whole call', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))

    await expect(ask(60_000)).rejects.toThrow('Jev error (timeout after 60 s)')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
