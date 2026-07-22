import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSentryToken = vi.fn(async () => 'test-sentry-token')
const getSentryOrg = vi.fn(async () => 'test-org')
const isSentryConfigured = vi.fn(async () => true)
vi.mock('./settings.js', () => ({ getSentryToken, getSentryOrg, isSentryConfigured }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { getIssue, searchIssues, isConfigured } = await import('./client.js')

function mockResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

beforeEach(() => {
  getSentryToken.mockResolvedValue('test-sentry-token')
  getSentryOrg.mockResolvedValue('test-org')
  isSentryConfigured.mockResolvedValue(true)
})

describe('isConfigured', () => {
  it('mirrors the stored settings', async () => {
    expect(await isConfigured()).toBe(true)

    isSentryConfigured.mockResolvedValue(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('getIssue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted issue with stacktrace', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: '12345',
        shortId: 'APP-123',
        title: 'TypeError: null is not an object',
        status: 'unresolved',
        level: 'error',
        count: '42',
        userCount: 10,
        firstSeen: '2024-01-01',
        lastSeen: '2024-01-10',
        culprit: 'app.js in handleRequest',
        permalink: 'https://sentry.io/issues/12345/',
        assignedTo: { type: 'user', name: 'Alice' },
      })
    )

    mockFetch.mockResolvedValueOnce(
      mockResponse({
        entries: [
          {
            type: 'exception',
            data: {
              values: [
                {
                  type: 'TypeError',
                  value: 'null is not an object',
                  stacktrace: {
                    frames: [
                      {
                        filename: 'app.js',
                        function: 'handleRequest',
                        lineNo: 42,
                        colNo: 10,
                        context: [[42, '  const x = null.foo;']],
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      })
    )

    const issue = await getIssue('12345')
    expect(issue.id).toBe('12345')
    expect(issue.shortId).toBe('APP-123')
    expect(issue.title).toContain('TypeError')
    expect(issue.assignee).toEqual({ type: 'user', name: 'Alice' })
    expect(issue.stacktrace).toBeTruthy()
    expect(issue.stacktrace[0].frames[0].filename).toBe('app.js')
  })

  it('returns null stacktrace when event fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: '123',
        shortId: 'APP-1',
        title: 'Error',
        status: 'unresolved',
        level: 'error',
        count: '1',
        userCount: 0,
        firstSeen: '',
        lastSeen: '',
        culprit: '',
        permalink: '',
        assignedTo: null,
      })
    )

    mockFetch.mockResolvedValueOnce(mockResponse({}, false, 404))

    const issue = await getIssue('123')
    expect(issue.stacktrace).toBeNull()
    expect(issue.assignee).toBeNull()
  })
})

describe('searchIssues', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted issue list', async () => {
    mockFetch.mockResolvedValue(
      mockResponse([
        {
          id: '1',
          shortId: 'APP-1',
          title: 'Error 1',
          status: 'unresolved',
          count: '5',
          lastSeen: '2024-01-01',
          permalink: 'https://sentry.io/issues/1/',
        },
        {
          id: '2',
          shortId: 'APP-2',
          title: 'Error 2',
          status: 'resolved',
          count: '2',
          lastSeen: '2024-01-02',
          permalink: 'https://sentry.io/issues/2/',
        },
      ])
    )

    const results = await searchIssues('TypeError')
    expect(results.length).toBe(2)
    expect(results[0].shortId).toBe('APP-1')
    expect(results[1].status).toBe('resolved')
  })

  it('handles empty results', async () => {
    mockFetch.mockResolvedValue(mockResponse([]))
    const results = await searchIssues('nothing')
    expect(results).toEqual([])
  })
})
