import { describe, it, expect, vi, beforeEach } from 'vitest'

const getBetterstackApiToken = vi.fn()
const getBetterstackConnectHost = vi.fn()
const getBetterstackUsername = vi.fn()
const getBetterstackPassword = vi.fn()
const isBetterstackConfigured = vi.fn()
vi.mock('./settings.js', () => ({
  getBetterstackApiToken,
  getBetterstackConnectHost,
  getBetterstackUsername,
  getBetterstackPassword,
  isBetterstackConfigured,
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { listSources, describeSource, searchLogs, runQuery, isConfigured, _resetBetterstackSourcesCacheForTests } =
  await import('./client.js')

const SOURCES_RESPONSE = {
  data: [
    {
      id: '95',
      attributes: { name: 'API', platform: 'nodejs', table_name: 'api', team_id: 123, logs_retention: 7 },
    },
    {
      id: '96',
      attributes: { name: 'Nginx', platform: 'nginx', table_name: 'nginx', team_id: 123, logs_retention: 30 },
    },
    { id: '97', attributes: { name: 'Broken', platform: 'nodejs', logs_retention: 7 } },
  ],
}

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) }
}

function textResponse(text) {
  return { ok: true, status: 200, text: async () => text }
}

function errorResponse(status, text) {
  return { ok: false, status, text: async () => text }
}

function lastCall() {
  return mockFetch.mock.calls[mockFetch.mock.calls.length - 1]
}

function lastSql() {
  return lastCall()[1].body
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetBetterstackSourcesCacheForTests()
  getBetterstackApiToken.mockResolvedValue('bs_token')
  getBetterstackConnectHost.mockResolvedValue('eu-nbg-2-connect.betterstackdata.com')
  getBetterstackUsername.mockResolvedValue('u1234')
  getBetterstackPassword.mockResolvedValue('p4ssw0rd')
  isBetterstackConfigured.mockResolvedValue(true)
})

describe('isConfigured', () => {
  it('mirrors the stored settings', async () => {
    expect(await isConfigured()).toBe(true)

    isBetterstackConfigured.mockResolvedValue(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('listSources', () => {
  it('derives the table prefix from the team id and drops incomplete sources', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(SOURCES_RESPONSE))

    const sources = await listSources()

    expect(sources).toEqual([
      { id: '95', name: 'API', platform: 'nodejs', table: 't123_api', retentionDays: 7 },
      { id: '96', name: 'Nginx', platform: 'nginx', table: 't123_nginx', retentionDays: 30 },
    ])
    const [url, options] = lastCall()
    expect(url).toBe('https://telemetry.betterstack.com/api/v1/sources?per_page=50')
    expect(options.headers.Authorization).toBe('Bearer bs_token')
  })

  it('serves the cached sources until the token changes', async () => {
    mockFetch.mockResolvedValue(jsonResponse(SOURCES_RESPONSE))

    await listSources()
    await listSources()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    getBetterstackApiToken.mockResolvedValue('rotated')
    await listSources()
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(lastCall()[1].headers.Authorization).toBe('Bearer rotated')
  })

  it('fails with a configuration hint when the token is missing', async () => {
    getBetterstackApiToken.mockResolvedValue(null)

    await expect(listSources()).rejects.toThrow(/not configured/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('surfaces the api status and body when the request fails', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'))

    await expect(listSources()).rejects.toThrow('Better Stack sources request failed (401): Unauthorized')
  })
})

describe('source resolution', () => {
  beforeEach(() => mockFetch.mockResolvedValueOnce(jsonResponse(SOURCES_RESPONSE)))

  it('matches a source by name or table, ignoring case', async () => {
    mockFetch.mockResolvedValue(textResponse(JSON.stringify({ meta: [], data: [] })))

    expect((await describeSource('api')).table).toBe('t123_api_logs')
    expect((await describeSource('T123_NGINX')).source).toBe('Nginx')
  })

  it('lists the available sources when the name is unknown', async () => {
    await expect(describeSource('billing')).rejects.toThrow(
      'Unknown log source "billing". Available sources: API, Nginx.'
    )
  })
})

describe('describeSource', () => {
  it('returns the column names and types of the logs table', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(SOURCES_RESPONSE))
    mockFetch.mockResolvedValueOnce(
      textResponse(
        JSON.stringify({
          meta: [
            { name: 'dt', type: 'DateTime64(6)' },
            { name: 'raw', type: 'String' },
          ],
          data: [],
        })
      )
    )

    const result = await describeSource('API')

    expect(result).toEqual({
      source: 'API',
      table: 't123_api_logs',
      columns: [
        { name: 'dt', type: 'DateTime64(6)' },
        { name: 'raw', type: 'String' },
      ],
    })
    expect(lastSql()).toBe('SELECT * FROM remote(t123_api_logs) LIMIT 0 FORMAT JSON')
  })
})

describe('searchLogs', () => {
  beforeEach(() => mockFetch.mockResolvedValueOnce(jsonResponse(SOURCES_RESPONSE)))

  it('queries recent and historical rows within the requested range', async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse(
        [
          JSON.stringify({ dt: '2026-07-27 10:00:00.000', raw: '{"level":"error","message":"boom"}' }),
          JSON.stringify({ dt: '2026-07-27 09:00:00.000', raw: '{"level":"error","message":"boom again"}' }),
        ].join('\n')
      )
    )

    const result = await searchLogs({
      source: 'API',
      query: 'boom',
      from: '2026-07-27T00:00:00Z',
      to: '2026-07-27T12:00:00Z',
      limit: 10,
    })

    expect(result).toEqual({
      source: 'API',
      from: '2026-07-27 00:00:00',
      to: '2026-07-27 12:00:00',
      rowCount: 2,
      truncated: false,
      logs: [
        { dt: '2026-07-27 10:00:00.000', raw: '{"level":"error","message":"boom"}', rawTruncated: false },
        { dt: '2026-07-27 09:00:00.000', raw: '{"level":"error","message":"boom again"}', rawTruncated: false },
      ],
    })

    const sql = lastSql()
    expect(sql).toContain('FROM remote(t123_api_logs)')
    expect(sql).toContain('FROM s3Cluster(primary, t123_api_s3) WHERE _row_type = 1')
    expect(sql).toContain("dt BETWEEN '2026-07-27 00:00:00' AND '2026-07-27 12:00:00'")
    expect(sql).toContain("positionCaseInsensitive(raw, 'boom') > 0")
    expect(sql).toContain('ORDER BY dt DESC LIMIT 10 FORMAT JSONEachRow')
    expect(sql.match(/ORDER BY dt DESC LIMIT 10/g)).toHaveLength(3)

    const options = lastCall()[1]
    expect(lastCall()[0]).toBe('https://eu-nbg-2-connect.betterstackdata.com')
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('u1234:p4ssw0rd').toString('base64')}`)
  })

  it('defaults to the last 24 hours and caps the limit', async () => {
    mockFetch.mockResolvedValueOnce(textResponse(''))

    await searchLogs({ source: 'API', query: 'timeout', limit: 500 })

    const sql = lastSql()
    expect(sql).toContain('LIMIT 100 FORMAT JSONEachRow')

    const [, from, to] = sql.match(/dt BETWEEN '([^']+)' AND '([^']+)'/)
    expect(new Date(`${to}Z`) - new Date(`${from}Z`)).toBe(24 * 3_600_000)
  })

  it('escapes quotes in the search fragment', async () => {
    mockFetch.mockResolvedValueOnce(textResponse(''))

    await searchLogs({ source: 'API', query: "it's 'down'" })

    expect(lastSql()).toContain("positionCaseInsensitive(raw, 'it\\'s \\'down\\'') > 0")
  })

  it('truncates very long log lines and flags them', async () => {
    const raw = 'x'.repeat(1500)
    mockFetch.mockResolvedValueOnce(textResponse(JSON.stringify({ dt: '2026-07-27 10:00:00.000', raw })))

    const result = await searchLogs({ source: 'API', query: 'x' })

    expect(result.logs[0].raw).toHaveLength(1000)
    expect(result.logs[0].rawTruncated).toBe(true)
  })

  it('redacts credentials that appear in a log line', async () => {
    const raw = '{"authorization":"Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM"}'
    mockFetch.mockResolvedValueOnce(textResponse(JSON.stringify({ dt: '2026-07-27 10:00:00.000', raw })))

    const result = await searchLogs({ source: 'API', query: 'authorization' })

    expect(result.logs[0].raw).toBe('{"authorization":"Bearer [redacted]"}')
  })

  it('reports truncation when the limit is reached', async () => {
    const rows = Array.from({ length: 2 }, (_, i) =>
      JSON.stringify({ dt: `2026-07-27 10:0${i}:00.000`, raw: '{"level":"error"}' })
    )
    mockFetch.mockResolvedValueOnce(textResponse(rows.join('\n')))

    const result = await searchLogs({ source: 'API', query: 'error', limit: 2 })

    expect(result.truncated).toBe(true)
  })

  it('rejects an empty query and an inverted range', async () => {
    await expect(searchLogs({ source: 'API', query: '   ' })).rejects.toThrow(/non-empty "query"/)
    await expect(
      searchLogs({ source: 'API', query: 'boom', from: '2026-07-27T12:00:00Z', to: '2026-07-27T00:00:00Z' })
    ).rejects.toThrow('"from" must be earlier than "to".')
    await expect(searchLogs({ source: 'API', query: 'boom', from: 'yesterday' })).rejects.toThrow(
      /Invalid date "yesterday"/
    )
  })
})

describe('runQuery', () => {
  it('wraps the query in a row limit and parses the rows', async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse(
        [JSON.stringify({ level: 'error', total: 12 }), JSON.stringify({ level: 'warn', total: 3 })].join('\n')
      )
    )

    const result = await runQuery(
      "SELECT JSONExtractString(raw, 'level') AS level, count() AS total FROM remote(t123_api_logs) GROUP BY level;"
    )

    expect(result).toEqual({
      columns: ['level', 'total'],
      rows: [
        { level: 'error', total: 12 },
        { level: 'warn', total: 3 },
      ],
      rowCount: 2,
      truncated: false,
    })
    expect(lastSql()).toBe(
      "SELECT * FROM (SELECT JSONExtractString(raw, 'level') AS level, count() AS total FROM remote(t123_api_logs) GROUP BY level) AS _q LIMIT 100 FORMAT JSONEachRow"
    )
  })

  it('redacts credentials extracted by the query', async () => {
    mockFetch.mockResolvedValueOnce(
      textResponse(JSON.stringify({ dsn: 'postgresql://app:s3cret@db.internal:5432/prod', total: 4 }))
    )

    const result = await runQuery("SELECT JSONExtractString(raw, 'dsn') AS dsn, count() AS total FROM remote(t1_l)")

    expect(result.rows).toEqual([{ dsn: 'postgresql://[redacted]@db.internal:5432/prod', total: 4 }])
  })

  it('rejects anything that is not a single read-only statement', async () => {
    await expect(runQuery('DROP TABLE t123_api_logs')).rejects.toThrow(/Only SELECT and WITH/)
    await expect(runQuery('SELECT 1; SELECT 2')).rejects.toThrow('Only a single statement is allowed.')
    await expect(runQuery('SELECT dt FROM remote(t123_api_logs) FORMAT CSV')).rejects.toThrow(/FORMAT clause/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fails with a configuration hint when the connection is incomplete', async () => {
    getBetterstackPassword.mockResolvedValue(null)

    await expect(runQuery('SELECT 1')).rejects.toThrow(/not configured/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('surfaces the query error returned by the api', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400, 'Code: 47. Unknown identifier'))

    await expect(runQuery('SELECT nope FROM remote(t123_api_logs)')).rejects.toThrow(
      'Better Stack query failed (400): Code: 47. Unknown identifier'
    )
  })
})
