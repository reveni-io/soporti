import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJevApiKey = vi.fn()
vi.mock('./settings.js', () => ({ getJevApiKey }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { listModels, JevApiError } = await import('./client.js')

function mockResponse(data, status = 200) {
  return { ok: status < 400, status, json: async () => data }
}

beforeEach(() => {
  mockFetch.mockReset()
  getJevApiKey.mockResolvedValue('jev-secret')
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
