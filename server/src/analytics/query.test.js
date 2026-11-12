import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

class FakeReadOnlyQueryError extends Error {}

vi.mock('../postgres/client.js', () => ({ runTypedQuery: vi.fn(), ReadOnlyQueryError: FakeReadOnlyQueryError }))

const { runTypedQuery } = await import('../postgres/client.js')
const { clearQueryCache } = await import('./query-cache.js')
const { runChartQuery, readChartQuery, QueryError } = await import('./query.js')

const UNREACHABLE = 'The database could not be reached. Check the connection in /admin (Database section).'

function field(name, dataTypeID) {
  return { name, dataTypeID }
}

function databaseError(message, code) {
  return Object.assign(new Error(message), { code })
}

describe('runChartQuery', () => {
  let consoleError

  beforeEach(() => {
    vi.clearAllMocks()
    clearQueryCache()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('runs the query with the dashboard row cap and a 30 second statement timeout', async () => {
    runTypedQuery.mockResolvedValue({ fields: [], rows: [], truncated: false })

    await runChartQuery('SELECT 1')

    expect(runTypedQuery).toHaveBeenCalledTimes(1)
    expect(runTypedQuery).toHaveBeenCalledWith('SELECT 1', { maxRows: 2000, timeoutMs: 30_000 })
  })

  it('maps the type of every column to a kind', async () => {
    runTypedQuery.mockResolvedValue({
      fields: [
        field('small', 21),
        field('regular', 23),
        field('big', 20),
        field('real', 700),
        field('double', 701),
        field('exact', 1700),
        field('day', 1082),
        field('local_time', 1114),
        field('instant', 1184),
        field('active', 16),
        field('name', 25),
        field('payload', 3802),
      ],
      rows: [],
      truncated: false,
    })

    const { columns } = await runChartQuery('SELECT * FROM everything')

    expect(columns).toEqual([
      { name: 'small', kind: 'number' },
      { name: 'regular', kind: 'number' },
      { name: 'big', kind: 'number' },
      { name: 'real', kind: 'number' },
      { name: 'double', kind: 'number' },
      { name: 'exact', kind: 'number' },
      { name: 'day', kind: 'date' },
      { name: 'local_time', kind: 'date' },
      { name: 'instant', kind: 'date' },
      { name: 'active', kind: 'boolean' },
      { name: 'name', kind: 'text' },
      { name: 'payload', kind: 'text' },
    ])
  })

  it('turns the bigint and numeric strings of the driver into numbers and leaves the rest alone', async () => {
    runTypedQuery.mockResolvedValue({
      fields: [field('returns', 20), field('rate', 1700), field('units', 23), field('code', 25)],
      rows: [
        { returns: '42', rate: '12.50', units: 3, code: '007' },
        { returns: null, rate: 'NaN', units: 0, code: null },
      ],
      truncated: true,
    })

    const result = await runChartQuery('SELECT * FROM weekly')

    expect(result.rows).toEqual([
      { returns: 42, rate: 12.5, units: 3, code: '007' },
      { returns: null, rate: 'NaN', units: 0, code: null },
    ])
    expect(result.truncated).toBe(true)
  })

  it.each([
    { kind: 'a date', oid: 1082, raw: '2026-03-03', value: '2026-03-03T00:00:00.000Z' },
    { kind: 'a timestamp', oid: 1114, raw: '2026-03-03 14:05:09', value: '2026-03-03T14:05:09.000Z' },
    {
      kind: 'a timestamp with microseconds',
      oid: 1114,
      raw: '2026-03-03 14:05:09.123456',
      value: '2026-03-03T14:05:09.123Z',
    },
    { kind: 'a timestamp with tenths', oid: 1114, raw: '2026-03-03 14:05:09.5', value: '2026-03-03T14:05:09.500Z' },
    { kind: 'a timestamptz in UTC', oid: 1184, raw: '2026-08-03 00:00:00+00', value: '2026-08-03T00:00:00.000Z' },
    { kind: 'a timestamptz east of UTC', oid: 1184, raw: '2026-03-02 00:00:00+01', value: '2026-03-02T00:00:00.000Z' },
    {
      kind: 'a timestamptz with a half-hour offset',
      oid: 1184,
      raw: '2026-03-02 00:00:00+05:30',
      value: '2026-03-02T00:00:00.000Z',
    },
    { kind: 'a timestamptz west of UTC', oid: 1184, raw: '2026-03-02 09:30:00-03', value: '2026-03-02T09:30:00.000Z' },
    {
      kind: 'a timestamptz with a fraction and an offset',
      oid: 1184,
      raw: '2026-03-02 23:59:59.987654-03',
      value: '2026-03-02T23:59:59.987Z',
    },
    {
      kind: 'a timestamptz with an offset down to the second',
      oid: 1184,
      raw: '1890-01-01 00:00:00-00:14:44',
      value: '1890-01-01T00:00:00.000Z',
    },
  ])('returns $kind as the wall-clock time the database shows, written as UTC', async ({ oid, raw, value }) => {
    runTypedQuery.mockResolvedValue({ fields: [field('moment', oid)], rows: [{ moment: raw }], truncated: false })

    const result = await runChartQuery('SELECT moment FROM events')

    expect(result.columns).toEqual([{ name: 'moment', kind: 'date' }])
    expect(result.rows).toEqual([{ moment: value }])
  })

  it.each([
    { kind: 'infinity', oid: 1184, raw: 'infinity' },
    { kind: 'minus infinity', oid: 1114, raw: '-infinity' },
    { kind: 'a date before Christ', oid: 1082, raw: '0044-03-15 BC' },
    { kind: 'a timestamp before Christ', oid: 1114, raw: '0044-03-15 12:00:00 BC' },
    { kind: 'a year of five digits', oid: 1082, raw: '10000-01-01' },
    { kind: 'a date in another DateStyle', oid: 1082, raw: '03/03/2026' },
    { kind: 'a timestamptz in another DateStyle', oid: 1184, raw: 'Tue Mar 03 14:05:09 2026 CET' },
    { kind: 'a missing value', oid: 1184, raw: null },
  ])('passes $kind through untouched', async ({ oid, raw }) => {
    runTypedQuery.mockResolvedValue({ fields: [field('moment', oid)], rows: [{ moment: raw }], truncated: false })

    const result = await runChartQuery('SELECT moment FROM events')

    expect(result.columns).toEqual([{ name: 'moment', kind: 'date' }])
    expect(result.rows).toEqual([{ moment: raw }])
  })

  it('returns the rows untouched when no column needs converting', async () => {
    const rows = [{ name: 'Acme', units: 3 }]
    runTypedQuery.mockResolvedValue({ fields: [field('name', 25), field('units', 23)], rows, truncated: false })

    const result = await runChartQuery('SELECT name, units FROM stores')

    expect(result.rows).toBe(rows)
    expect(result.truncated).toBe(false)
  })

  it('lists a column name that the query returns twice once, with the type of the value the row keeps', async () => {
    runTypedQuery.mockResolvedValue({
      fields: [field('id', 20), field('name', 25), field('id', 25)],
      rows: [{ id: '0042', name: 'Acme' }],
      truncated: false,
    })

    const result = await runChartQuery('SELECT o.id, s.name, s.id FROM orders o JOIN stores s ON s.id = o.store_id')

    expect(result.columns).toEqual([
      { name: 'id', kind: 'text' },
      { name: 'name', kind: 'text' },
    ])
    expect(result.rows).toEqual([{ id: '0042', name: 'Acme' }])
  })

  it('reports a statement that is not a SELECT or a WITH with the message of the database client', async () => {
    runTypedQuery.mockRejectedValue(new FakeReadOnlyQueryError('Only SELECT and WITH (CTE) queries are allowed.'))

    const failure = await runChartQuery('DELETE FROM orders').catch(err => err)

    expect(failure).toBeInstanceOf(QueryError)
    expect(failure.message).toBe('Only SELECT and WITH (CTE) queries are allowed.')
    expect(consoleError).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'a syntax error', code: '42601', message: 'syntax error at or near "FORM"' },
    { kind: 'an unknown column', code: '42703', message: 'column "kind" does not exist Columns of the tables: a, b.' },
    { kind: 'a division by zero', code: '22012', message: 'division by zero' },
    { kind: 'a statement timeout', code: '57014', message: 'canceling statement due to statement timeout Narrow it.' },
    { kind: 'an error raised by a function', code: 'P0001', message: 'Unknown period' },
  ])('reports $kind with the message of the database', async ({ code, message }) => {
    const original = databaseError(message, code)
    runTypedQuery.mockRejectedValue(original)

    const failure = await runChartQuery('SELECT 1').catch(err => err)

    expect(failure).toBeInstanceOf(QueryError)
    expect(failure.message).toBe(message)
    expect(failure.cause).toBe(original)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'a refused connection', error: databaseError('connect ECONNREFUSED 10.0.0.5:5432', 'ECONNREFUSED') },
    { kind: 'a broken pipe', error: databaseError('write EPIPE', 'EPIPE') },
    { kind: 'a connection exception', error: databaseError('terminating connection db-1.internal', '08006') },
    { kind: 'a failed login', error: databaseError('password authentication failed for user "reports"', '28P01') },
    { kind: 'an unknown database', error: databaseError('database "shop_prod" does not exist', '3D000') },
    { kind: 'too many connections', error: databaseError('sorry, too many clients already', '53300') },
    { kind: 'a database shutting down', error: databaseError('terminating connection due to administrator', '57P01') },
    { kind: 'a missing connection string', error: new Error('PostgreSQL is not configured. Set the connection.') },
  ])('hides the details of $kind behind a fixed sentence and logs them', async ({ error }) => {
    runTypedQuery.mockRejectedValue(error)

    const failure = await runChartQuery('SELECT 1').catch(err => err)

    expect(failure).toBeInstanceOf(QueryError)
    expect(failure.message).toBe(UNREACHABLE)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('[analytics] Failed to run a chart query:', error)
  })
})

describe('the cache of chart query results', () => {
  const SQL = 'SELECT week, returns FROM weekly_returns'
  const OPENED_AT = '2026-11-12T10:00:00.000Z'
  const MINUTE_MS = 60_000

  function weekly(returns) {
    return { fields: [field('returns', 23)], rows: [{ returns }], truncated: false }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(OPENED_AT))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    clearQueryCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stamps a result with the moment it was read from the database', async () => {
    runTypedQuery.mockResolvedValue(weekly(42))

    const result = await runChartQuery(SQL)

    expect(result).toEqual({
      columns: [{ name: 'returns', kind: 'number' }],
      rows: [{ returns: 42 }],
      truncated: false,
      fetchedAt: OPENED_AT,
    })
  })

  it('serves a result that was just fetched without querying the database again', async () => {
    runTypedQuery.mockResolvedValue(weekly(42))
    const fetched = await runChartQuery(SQL)
    vi.advanceTimersByTime(4 * MINUTE_MS)

    const cached = await readChartQuery(SQL)

    expect(cached).toBe(fetched)
    expect(cached.fetchedAt).toBe(OPENED_AT)
    expect(runTypedQuery).toHaveBeenCalledTimes(1)
  })

  it('queries the database on a cache-first read that misses, then serves the next reads from the cache', async () => {
    runTypedQuery.mockResolvedValue(weekly(42))

    const first = await readChartQuery(SQL)
    const second = await readChartQuery(SQL)

    expect(first.rows).toEqual([{ returns: 42 }])
    expect(second).toBe(first)
    expect(runTypedQuery).toHaveBeenCalledTimes(1)
    expect(runTypedQuery).toHaveBeenCalledWith(SQL, { maxRows: 2000, timeoutMs: 30_000 })
  })

  it('queries the database again once the cached result is five minutes old', async () => {
    runTypedQuery.mockResolvedValueOnce(weekly(42)).mockResolvedValueOnce(weekly(43))
    await readChartQuery(SQL)
    vi.advanceTimersByTime(5 * MINUTE_MS)

    const result = await readChartQuery(SQL)

    expect(result.rows).toEqual([{ returns: 43 }])
    expect(result.fetchedAt).toBe('2026-11-12T10:05:00.000Z')
    expect(runTypedQuery).toHaveBeenCalledTimes(2)
  })

  it('always queries the database on a plain run and replaces what was cached', async () => {
    runTypedQuery.mockResolvedValueOnce(weekly(42)).mockResolvedValueOnce(weekly(43))
    await runChartQuery(SQL)
    vi.advanceTimersByTime(MINUTE_MS)

    const fresh = await runChartQuery(SQL)
    const cached = await readChartQuery(SQL)

    expect(fresh.rows).toEqual([{ returns: 43 }])
    expect(fresh.fetchedAt).toBe('2026-11-12T10:01:00.000Z')
    expect(cached).toBe(fresh)
    expect(runTypedQuery).toHaveBeenCalledTimes(2)
  })

  it('shares one database query between cache-first and fresh callers that arrive together', async () => {
    let finish
    runTypedQuery.mockImplementation(() => new Promise(resolve => (finish = resolve)))

    const callers = [readChartQuery(SQL), runChartQuery(SQL), readChartQuery(SQL)]
    await vi.waitFor(() => expect(runTypedQuery).toHaveBeenCalledTimes(1))
    finish(weekly(42))
    const [first, second, third] = await Promise.all(callers)

    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(runTypedQuery).toHaveBeenCalledTimes(1)
  })

  it('keeps the results of different queries apart', async () => {
    runTypedQuery.mockResolvedValueOnce(weekly(42)).mockResolvedValueOnce(weekly(7))

    const weeklyReturns = await readChartQuery(SQL)
    const dailyReturns = await readChartQuery('SELECT day, returns FROM daily_returns')

    expect(weeklyReturns.rows).toEqual([{ returns: 42 }])
    expect(dailyReturns.rows).toEqual([{ returns: 7 }])
    expect(runTypedQuery).toHaveBeenCalledTimes(2)
  })

  it('never caches a failure: the next read queries the database again', async () => {
    runTypedQuery
      .mockRejectedValueOnce(databaseError('relation "weekly_returns" does not exist', '42P01'))
      .mockResolvedValueOnce(weekly(42))

    const failure = await readChartQuery(SQL).catch(err => err)
    const result = await readChartQuery(SQL)

    expect(failure).toBeInstanceOf(QueryError)
    expect(failure.message).toBe('relation "weekly_returns" does not exist')
    expect(result.rows).toEqual([{ returns: 42 }])
    expect(runTypedQuery).toHaveBeenCalledTimes(2)
  })

  it('keeps serving the previous result when a refresh fails', async () => {
    runTypedQuery
      .mockResolvedValueOnce(weekly(42))
      .mockRejectedValueOnce(databaseError('canceling statement due to statement timeout', '57014'))
    const fetched = await runChartQuery(SQL)

    await expect(runChartQuery(SQL)).rejects.toBeInstanceOf(QueryError)

    expect(await readChartQuery(SQL)).toBe(fetched)
    expect(runTypedQuery).toHaveBeenCalledTimes(2)
  })
})
