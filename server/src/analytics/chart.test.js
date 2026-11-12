import { describe, it, expect } from 'vitest'
import { CHART_TYPES, parseChart, reconcileChart } from './chart.js'

const TABLE = { type: 'table', xKey: null, groupKey: null, series: [], stacked: false }
const WEEKLY = [
  { name: 'week', kind: 'date' },
  { name: 'store', kind: 'text' },
  { name: 'returns', kind: 'number' },
  { name: 'refunded_amount', kind: 'number' },
]

function chart(overrides = {}) {
  return {
    type: 'bar',
    xKey: 'week',
    groupKey: null,
    series: [{ key: 'returns', label: 'Returns' }],
    stacked: false,
    ...overrides,
  }
}

describe('CHART_TYPES', () => {
  it('lists the chart types of the contract', () => {
    expect(CHART_TYPES).toEqual(['bar', 'row', 'line', 'area', 'pie', 'number', 'table'])
  })
})

describe('parseChart', () => {
  it('accepts a missing chart as none', () => {
    expect(parseChart(undefined)).toEqual({ value: null })
    expect(parseChart(null)).toEqual({ value: null })
  })

  it('returns the chart in the stored shape', () => {
    const parsed = parseChart({
      type: 'line',
      xKey: 'week',
      groupKey: 'store',
      series: [{ key: 'returns', label: '  Returns  ' }],
      stacked: true,
      extra: 'ignored',
    })

    expect(parsed).toEqual({
      value: {
        type: 'line',
        xKey: 'week',
        groupKey: 'store',
        series: [{ key: 'returns', label: 'Returns' }],
        stacked: true,
      },
    })
  })

  it('fills in what a partial chart leaves out', () => {
    expect(parseChart({ type: 'table' })).toEqual({ value: TABLE })
    expect(parseChart({ type: 'bar', xKey: '', groupKey: null, series: [{ key: 'total_returns' }] })).toEqual({
      value: {
        type: 'bar',
        xKey: null,
        groupKey: null,
        series: [{ key: 'total_returns', label: 'Total returns' }],
        stacked: false,
      },
    })
  })

  it.each([
    { kind: 'a string', value: 'bar' },
    { kind: 'a list', value: [chart()] },
  ])('rejects $kind instead of an object', ({ value }) => {
    expect(parseChart(value)).toEqual({ error: 'The chart must be an object.' })
  })

  it.each([
    { kind: 'an unknown type', value: chart({ type: 'donut' }) },
    { kind: 'a missing type', value: { xKey: 'week' } },
  ])('rejects $kind', ({ value }) => {
    expect(parseChart(value)).toEqual({
      error: 'The chart type must be one of: bar, row, line, area, pie, number, table.',
    })
  })

  it('rejects a stacked option that is not a boolean', () => {
    expect(parseChart(chart({ stacked: 'yes' }))).toEqual({ error: 'The chart stacked option must be true or false.' })
  })

  it.each([
    { field: 'xKey', value: chart({ xKey: 7 }) },
    { field: 'xKey', value: chart({ xKey: 'x'.repeat(101) }) },
    { field: 'groupKey', value: chart({ groupKey: { name: 'store' } }) },
  ])('rejects a $field that is not a short column name', ({ field, value }) => {
    expect(parseChart(value)).toEqual({
      error: `The chart ${field} must be a column name of at most 100 characters.`,
    })
  })

  it.each([
    { kind: 'something that is not a list', series: 'returns' },
    { kind: 'more than eight entries', series: Array.from({ length: 9 }, (_, index) => ({ key: `m${index}` })) },
  ])('rejects series that are $kind', ({ series }) => {
    expect(parseChart(chart({ series }))).toEqual({ error: 'The chart series must be a list of up to 8 columns.' })
  })

  it.each([
    { kind: 'is not an object', entry: 'returns' },
    { kind: 'has no key', entry: { label: 'Returns' } },
    { kind: 'has an empty key', entry: { key: '' } },
    { kind: 'has a key that is too long', entry: { key: 'k'.repeat(101) } },
    { kind: 'has a label that is not a string', entry: { key: 'returns', label: 3 } },
    { kind: 'has a label that is too long', entry: { key: 'returns', label: 'l'.repeat(81) } },
  ])('rejects a series entry that $kind', ({ entry }) => {
    expect(parseChart(chart({ series: [entry] }))).toEqual({
      error: 'Every chart series needs a column key of at most 100 characters and an optional label of at most 80.',
    })
  })
})

describe('reconcileChart', () => {
  it.each([
    { kind: 'no chart', value: null },
    { kind: 'a chart without a type', value: { xKey: 'week' } },
    { kind: 'an unknown type', value: chart({ type: 'donut' }) },
    { kind: 'a table with leftover keys', value: chart({ type: 'table', stacked: true }) },
  ])('turns $kind into a table without keys', ({ value }) => {
    expect(reconcileChart(value, WEEKLY)).toEqual(TABLE)
  })

  it('keeps a chart whose keys all exist', () => {
    const value = chart({
      type: 'area',
      series: [
        { key: 'returns', label: 'Returns' },
        { key: 'refunded_amount', label: 'Refunded' },
      ],
      stacked: true,
    })

    expect(reconcileChart(value, WEEKLY)).toEqual(value)
  })

  it('falls back to the first column that is not a number when the x column does not exist', () => {
    expect(reconcileChart(chart({ xKey: 'month' }), WEEKLY).xKey).toBe('week')
    expect(reconcileChart(chart({ xKey: '' }), WEEKLY.slice(1)).xKey).toBe('store')
  })

  it('falls back to the first column when every column is a number', () => {
    const columns = [
      { name: 'hour', kind: 'number' },
      { name: 'orders', kind: 'number' },
    ]

    expect(reconcileChart(chart({ xKey: null, series: [] }), columns)).toEqual(
      chart({ xKey: 'hour', series: [{ key: 'orders', label: 'Orders' }] })
    )
  })

  it('drops the series that are not number columns, repeat a key or reuse the x column', () => {
    const columns = [{ name: 'units', kind: 'number' }, ...WEEKLY]
    const value = chart({
      xKey: 'units',
      series: [
        { key: 'units', label: 'Units' },
        { key: 'store', label: 'Store' },
        { key: 'missing', label: 'Missing' },
        { key: 'returns', label: '' },
        { key: 'returns', label: 'Again' },
        'returns',
      ],
    })

    expect(reconcileChart(value, columns).series).toEqual([{ key: 'returns', label: 'Returns' }])
  })

  it('plots every other number column when no submitted series survives', () => {
    const value = chart({ series: [{ key: 'total', label: 'Total' }] })

    expect(reconcileChart(value, WEEKLY).series).toEqual([
      { key: 'returns', label: 'Returns' },
      { key: 'refunded_amount', label: 'Refunded amount' },
    ])
  })

  it('caps the series at eight', () => {
    const measures = Array.from({ length: 10 }, (_, index) => ({ name: `m${index}`, kind: 'number' }))
    const reconciled = reconcileChart(chart({ series: [] }), [WEEKLY[0], ...measures])

    expect(reconciled.series.map(entry => entry.key)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'])
  })

  it('keeps a group column that exists and plots a single series with it', () => {
    const value = chart({
      type: 'line',
      groupKey: 'store',
      series: [
        { key: 'returns', label: 'Returns' },
        { key: 'refunded_amount', label: 'Refunded' },
      ],
    })

    expect(reconcileChart(value, WEEKLY)).toEqual(
      chart({ type: 'line', groupKey: 'store', series: [{ key: 'returns', label: 'Returns' }] })
    )
  })

  it('leaves a numeric group column out of the series it falls back to', () => {
    const columns = [
      { name: 'week', kind: 'date' },
      { name: 'store_id', kind: 'number' },
      { name: 'returns', kind: 'number' },
    ]

    expect(reconcileChart(chart({ groupKey: 'store_id', series: [] }), columns)).toEqual(
      chart({ groupKey: 'store_id', series: [{ key: 'returns', label: 'Returns' }] })
    )
  })

  it.each([
    { kind: 'does not exist', groupKey: 'country' },
    { kind: 'is the x column', groupKey: 'week' },
    { kind: 'is one of the series', groupKey: 'returns' },
    { kind: 'is empty', groupKey: '' },
  ])('drops a group column that $kind', ({ groupKey }) => {
    expect(reconcileChart(chart({ groupKey }), WEEKLY).groupKey).toBeNull()
  })

  it('gives a pie one series and no group', () => {
    const value = chart({
      type: 'pie',
      xKey: 'store',
      groupKey: 'week',
      series: [
        { key: 'returns', label: 'Returns' },
        { key: 'refunded_amount', label: 'Refunded' },
      ],
      stacked: true,
    })

    expect(reconcileChart(value, WEEKLY)).toEqual({
      type: 'pie',
      xKey: 'store',
      groupKey: null,
      series: [{ key: 'returns', label: 'Returns' }],
      stacked: false,
    })
  })

  it.each([
    { type: 'bar', stacked: true },
    { type: 'row', stacked: true },
    { type: 'area', stacked: true },
    { type: 'line', stacked: false },
  ])('reports stacked as $stacked for a stacked $type', ({ type, stacked }) => {
    expect(reconcileChart(chart({ type, stacked: true }), WEEKLY).stacked).toBe(stacked)
  })

  it('treats a stacked option that is not a boolean as off', () => {
    expect(reconcileChart(chart({ stacked: 'true' }), WEEKLY).stacked).toBe(false)
  })

  it('falls back to a table when there is no number column to plot', () => {
    const columns = [
      { name: 'name', kind: 'text' },
      { name: 'created_at', kind: 'date' },
    ]

    expect(reconcileChart(chart(), columns)).toEqual(TABLE)
    expect(reconcileChart(chart(), [])).toEqual(TABLE)
  })

  it('falls back to a table when the only number column is the x column', () => {
    expect(reconcileChart(chart({ xKey: 'total' }), [{ name: 'total', kind: 'number' }])).toEqual(TABLE)
  })

  it('keeps the number column a headline figure asks for', () => {
    const value = chart({ type: 'number', series: [{ key: 'refunded_amount', label: 'Refunded' }], stacked: true })

    expect(reconcileChart(value, WEEKLY)).toEqual({
      type: 'number',
      xKey: null,
      groupKey: null,
      series: [{ key: 'refunded_amount', label: 'Refunded' }],
      stacked: false,
    })
  })

  it('shows the first number column when a headline figure names a column that is not a number', () => {
    const named = chart({ type: 'number', series: [{ key: 'store', label: 'Store' }] })
    const unnamed = chart({ type: 'number', series: undefined })

    expect(reconcileChart(named, WEEKLY).series).toEqual([{ key: 'returns', label: 'Returns' }])
    expect(reconcileChart(unnamed, WEEKLY).series).toEqual([{ key: 'returns', label: 'Returns' }])
  })

  it('turns a headline figure into a table when the result has no number', () => {
    expect(reconcileChart(chart({ type: 'number' }), [{ name: 'name', kind: 'text' }])).toEqual(TABLE)
  })

  it.each([
    { key: 'total_returns', label: 'Total returns' },
    { key: 'avg-order  value', label: 'Avg order value' },
    { key: '_', label: '_' },
  ])('labels the series $key as "$label" when it has no label', ({ key, label }) => {
    const reconciled = reconcileChart(chart({ type: 'number', series: [{ key }] }), [{ name: key, kind: 'number' }])

    expect(reconciled.series).toEqual([{ key, label }])
  })

  it('trims a label and caps its length', () => {
    const value = chart({ series: [{ key: 'returns', label: `  ${'l'.repeat(120)}  ` }] })

    expect(reconcileChart(value, WEEKLY).series[0].label).toBe('l'.repeat(80))
  })
})
