import { describe, it, expect, vi, beforeEach } from 'vitest'

const getHelpjuiceApiKey = vi.fn(async () => 'test-key')
const getHelpjuiceAccount = vi.fn(async () => 'test-account')
const isHelpjuiceConfigured = vi.fn(async () => true)
vi.mock('./settings.js', () => ({ getHelpjuiceApiKey, getHelpjuiceAccount, isHelpjuiceConfigured }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { searchArticles, getArticle, isConfigured } = await import('./client.js')

function mockResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  getHelpjuiceApiKey.mockResolvedValue('test-key')
  getHelpjuiceAccount.mockResolvedValue('test-account')
  isHelpjuiceConfigured.mockResolvedValue(true)
})

describe('isConfigured', () => {
  it('mirrors the stored settings', async () => {
    expect(await isConfigured()).toBe(true)

    isHelpjuiceConfigured.mockResolvedValue(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('searchArticles', () => {
  it('returns formatted search results', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        searches: [
          { id: 1, name: 'Getting Started', url: 'https://test-account.helpjuice.com/articles/1' },
          { id: 2, name: 'FAQ', url: 'https://test-account.helpjuice.com/articles/2' },
        ],
      })
    )

    const results = await searchArticles('getting started')
    expect(results).toEqual([
      { id: 1, title: 'Getting Started', url: 'https://test-account.helpjuice.com/articles/1' },
      { id: 2, title: 'FAQ', url: 'https://test-account.helpjuice.com/articles/2' },
    ])
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-account.helpjuice.com/api/v3/search?query=getting%20started',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'test-key' }),
      })
    )
  })

  it('handles empty results', async () => {
    mockFetch.mockResolvedValue(mockResponse({ searches: [] }))
    const results = await searchArticles('nonexistent')
    expect(results).toEqual([])
  })

  it('fails with a clear error when Helpjuice is not configured', async () => {
    getHelpjuiceApiKey.mockResolvedValue(null)
    await expect(searchArticles('anything')).rejects.toThrow('admin panel')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('getArticle', () => {
  it('returns article with content stripped of HTML', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        article: {
          id: 1,
          name: 'Getting Started',
          url: 'https://test-account.helpjuice.com/articles/1',
          answer: { body: '<p>Welcome to <strong>Helpjuice</strong>!</p>' },
        },
      })
    )

    const article = await getArticle('1')
    expect(article).toEqual({
      id: 1,
      title: 'Getting Started',
      url: 'https://test-account.helpjuice.com/articles/1',
      body: 'Welcome to Helpjuice!',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test-account.helpjuice.com/api/v3/articles/1',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('handles API errors', async () => {
    mockFetch.mockResolvedValue(mockResponse({ message: 'Not found' }, false, 404))
    await expect(getArticle('999')).rejects.toThrow('Helpjuice API')
  })

  it('fails with a clear error when Helpjuice is not configured', async () => {
    getHelpjuiceAccount.mockResolvedValue(null)
    await expect(getArticle('1')).rejects.toThrow('admin panel')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
