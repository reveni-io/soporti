import { describe, it, expect, vi, beforeEach } from 'vitest'

class FakeQueryError extends Error {}

vi.mock('./query.js', () => ({ runChartQuery: vi.fn(), QueryError: FakeQueryError }))

const { runChartQuery } = await import('./query.js')
const { buildSubmitChartTool, describeToolStep } = await import('./tools.js')

const SQL = "SELECT date_trunc('week', created_at) AS week, count(*) AS returns FROM returns GROUP BY 1 ORDER BY 1"
const COLUMNS = [
  { name: 'week', kind: 'date' },
  { name: 'returns', kind: 'number' },
]
const CHART = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}

let ctx

function submission(overrides = {}) {
  return {
    title: 'Returns per week',
    sql: SQL,
    type: 'bar',
    xKey: 'week',
    groupKey: '',
    series: [{ key: 'returns', label: 'Returns' }],
    stacked: false,
    ...overrides,
  }
}

function queryResult(overrides = {}) {
  return { columns: COLUMNS, rows: [{ week: '2026-08-03T00:00:00.000Z', returns: 42 }], truncated: false, ...overrides }
}

async function submit(input) {
  return JSON.parse(await buildSubmitChartTool(ctx).invoke({}, JSON.stringify(input)))
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx = {
    card: { id: '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5', title: 'Returns per week over the last 3 months' },
    state: { submission: null, settled: false, reply: '' },
  }
})

describe('submit_chart', () => {
  it('is a tool named submit_chart whose every parameter is required', () => {
    const submitChartTool = buildSubmitChartTool(ctx)

    expect(submitChartTool.name).toBe('submit_chart')
    expect(submitChartTool.parameters.required).toEqual([
      'title',
      'sql',
      'type',
      'xKey',
      'groupKey',
      'series',
      'stacked',
    ])
    expect(submitChartTool.parameters.properties.series.items.required).toEqual(['key', 'label'])
  })

  it('runs the query exactly as it stores it, keeps the submission and reports what was saved', async () => {
    runChartQuery.mockResolvedValue(queryResult({ fetchedAt: '2026-11-12T10:00:00.000Z' }))

    const result = await submit(submission({ title: '  Returns per week  ', sql: `  ${SQL}  ` }))

    expect(runChartQuery).toHaveBeenCalledTimes(1)
    expect(runChartQuery).toHaveBeenCalledWith(SQL)
    expect(result).toEqual({ ok: true, rowCount: 1, truncated: false, columns: COLUMNS, chart: CHART })
    expect(ctx.state.submission).toEqual({ title: 'Returns per week', sql: SQL, chart: CHART })
    expect(ctx.state.settled).toBe(true)
  })

  it('returns the chart reconciled with the columns of the result and leaves the run open to fix it', async () => {
    runChartQuery.mockResolvedValue(
      queryResult({ columns: [{ name: 'name', kind: 'text' }], rows: [{ name: 'Acme' }] })
    )

    const result = await submit(submission({ type: 'line' }))

    expect(result.chart).toEqual({ type: 'table', xKey: null, groupKey: null, series: [], stacked: false })
    expect(ctx.state.submission.chart).toEqual(result.chart)
    expect(ctx.state.settled).toBe(false)
  })

  it.each([
    { kind: 'an empty result', overrides: { rows: [] }, rowCount: 0 },
    { kind: 'a result cut at the row cap', overrides: { truncated: true }, rowCount: 1 },
  ])('keeps the submission of $kind but leaves the run open to reconsider it', async ({ overrides, rowCount }) => {
    runChartQuery.mockResolvedValue(queryResult(overrides))

    const result = await submit(submission())

    expect(result).toMatchObject({ ok: true, rowCount, truncated: overrides.truncated ?? false })
    expect(ctx.state.submission).toEqual({ title: 'Returns per week', sql: SQL, chart: CHART })
    expect(ctx.state.settled).toBe(false)
  })

  it('keeps the title of the card when the model sends none and shortens one that is too long', async () => {
    runChartQuery.mockResolvedValue(queryResult())

    await submit(submission({ title: '   ' }))
    expect(ctx.state.submission.title).toBe('Returns per week over the last 3 months')

    await submit(submission({ title: 'Returns '.repeat(40) }))
    expect(ctx.state.submission.title).toHaveLength(120)
    expect(ctx.state.submission.title.endsWith('…')).toBe(true)
  })

  it('hands a query error back to the model and keeps the previous submission', async () => {
    runChartQuery.mockResolvedValueOnce(queryResult({ rows: [] }))
    runChartQuery.mockRejectedValueOnce(new FakeQueryError('column "kind" does not exist'))

    await submit(submission())
    const result = await submit(submission({ sql: 'SELECT kind FROM returns' }))

    expect(result).toEqual({ error: 'column "kind" does not exist' })
    expect(ctx.state.submission).toEqual({ title: 'Returns per week', sql: SQL, chart: CHART })
    expect(ctx.state.settled).toBe(false)
  })

  it('lets the last successful submission win', async () => {
    runChartQuery.mockResolvedValueOnce(queryResult({ rows: [] }))
    runChartQuery.mockResolvedValueOnce(queryResult())

    await submit(submission())
    await submit(submission({ title: 'Weekly returns', sql: 'SELECT week, returns FROM weekly_returns' }))

    expect(ctx.state.submission).toEqual({
      title: 'Weekly returns',
      sql: 'SELECT week, returns FROM weekly_returns',
      chart: CHART,
    })
    expect(ctx.state.settled).toBe(true)
  })

  it('does not report an unexpected failure as a query error, and stores nothing', async () => {
    runChartQuery.mockRejectedValue(new TypeError('boom'))

    const output = await buildSubmitChartTool(ctx).invoke({}, JSON.stringify(submission()))

    expect(output).toContain('An error occurred while running the tool')
    expect(output).toContain('boom')
    expect(ctx.state.submission).toBeNull()
    expect(ctx.state.settled).toBe(false)
  })
})

describe('describeToolStep', () => {
  it.each([
    { name: 'list_database_schemas', args: '{}', step: 'Looking at the schemas' },
    { name: 'list_database_tables', args: '{"schema":"public"}', step: 'Listing the tables' },
    {
      name: 'describe_database_table',
      args: '{"schema":"public","table":"orders"}',
      step: 'Reading the columns of orders',
    },
    { name: 'describe_database_table', args: '{}', step: 'Reading the columns of a table' },
    { name: 'describe_database_table', args: '{"table":', step: 'Reading the columns of a table' },
    { name: 'describe_database_table', args: undefined, step: 'Reading the columns of a table' },
    { name: 'query_database', args: '{"sql":"SELECT 1"}', step: 'Trying a query' },
    { name: 'submit_chart', args: '{}', step: 'Building the chart' },
    { name: 'something_else', args: '{}', step: 'Working on the chart' },
  ])('describes $name called with $args as "$step"', ({ name, args, step }) => {
    expect(describeToolStep(name, args)).toBe(step)
  })
})
