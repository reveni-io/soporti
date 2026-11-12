import { describe, it, expect } from 'vitest'
import {
  CATEGORY_KEY,
  CHART_VIEW,
  createLabelFormatter,
  formatCompactNumber,
  formatNumber,
  formatShare,
  shapeChart,
  truncateLabel,
  truncateNarrowLabel,
} from './chart-data.js'

function day(offset) {
  return new Date(Date.UTC(2026, 2, 3 + offset)).toISOString()
}

describe('formatNumber', () => {
  it('groups thousands and keeps up to two decimals', () => {
    expect(formatNumber(12345.6)).toBe('12,345.6')
    expect(formatNumber(1200)).toBe('1,200')
    expect(formatNumber(-45.678)).toBe('-45.68')
  })

  it('keeps four significant digits below one so a rate is not rounded to zero', () => {
    expect(formatNumber(0.0345678)).toBe('0.03457')
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatCompactNumber', () => {
  it('writes the number in full under ten thousand', () => {
    expect(formatCompactNumber(1284)).toBe('1,284')
    expect(formatCompactNumber(9999)).toBe('9,999')
  })

  it('compacts from ten thousand up', () => {
    expect(formatCompactNumber(12949)).toBe('12.9K')
    expect(formatCompactNumber(4213877.5)).toBe('4.2M')
    expect(formatCompactNumber(-15300)).toBe('-15.3K')
  })
})

describe('formatShare', () => {
  it('formats a ratio as a percentage with one decimal at most', () => {
    expect(formatShare(0.4234)).toBe('42.3%')
    expect(formatShare(0.5)).toBe('50%')
  })
})

describe('truncateLabel', () => {
  it('leaves a short label alone', () => {
    expect(truncateLabel('USB-C hub')).toBe('USB-C hub')
  })

  it('cuts a long label at eighteen characters with an ellipsis', () => {
    expect(truncateLabel('Wireless noise-cancelling headphones')).toBe('Wireless noise-ca…')
  })

  it('accepts a non-string tick value', () => {
    expect(truncateLabel(2026)).toBe('2026')
  })
})

describe('truncateNarrowLabel', () => {
  it('cuts at ten characters for narrow cards', () => {
    expect(truncateNarrowLabel('Wireless noise-cancelling headphones')).toBe('Wireless…')
    expect(truncateNarrowLabel('Laptop sleeve')).toBe('Laptop sl…')
  })
})

describe('createLabelFormatter', () => {
  it('labels month buckets with the month and the year', () => {
    const rows = [{ month: '2026-03-01T00:00:00.000Z' }, { month: '2026-04-01T00:00:00.000Z' }]
    const labels = createLabelFormatter({ name: 'month', kind: 'date' }, rows)

    expect(labels.short(rows[0].month)).toBe('Mar 2026')
    expect(labels.long(rows[1].month)).toBe('Apr 2026')
  })

  it('labels day buckets without the year on the axis and with it in the long form', () => {
    const rows = [{ day: day(0) }, { day: day(1) }]
    const labels = createLabelFormatter({ name: 'day', kind: 'date' }, rows)

    expect(labels.short(rows[0].day)).toBe('Mar 3')
    expect(labels.long(rows[0].day)).toBe('Mar 3, 2026')
  })

  it('adds the year to day labels when the data spans more than one year', () => {
    const rows = [{ day: '2025-12-30T00:00:00.000Z' }, { day: '2026-01-02T00:00:00.000Z' }]
    const labels = createLabelFormatter({ name: 'day', kind: 'date' }, rows)

    expect(labels.short(rows[0].day)).toBe('Dec 30, 2025')
    expect(labels.short(rows[1].day)).toBe('Jan 2, 2026')
  })

  it('adds the time when any value is not at midnight UTC', () => {
    const rows = [{ at: '2026-03-03T14:00:00.000Z' }, { at: '2026-03-04T00:00:00.000Z' }]
    const labels = createLabelFormatter({ name: 'at', kind: 'date' }, rows)

    expect(labels.short(rows[0].at)).toBe('Mar 3, 14:00')
    expect(labels.long(rows[0].at)).toBe('Mar 3, 2026, 14:00')
  })

  it('formats in UTC so a bucket never shifts a day', () => {
    const rows = [{ day: '2026-03-03T00:00:00.000Z' }, { day: '2026-03-31T00:00:00.000Z' }]
    const labels = createLabelFormatter({ name: 'day', kind: 'date' }, rows)

    expect(labels.short(rows[1].day)).toBe('Mar 31')
  })

  it('labels year buckets with the year alone', () => {
    const rows = [{ year: '2025-01-01T00:00:00.000Z' }, { year: '2026-01-01T00:00:00.000Z' }]
    const labels = createLabelFormatter({ name: 'year', kind: 'date' }, rows)

    expect(labels.short(rows[0].year)).toBe('2025')
    expect(labels.long(rows[1].year)).toBe('2026')
  })

  it('keeps a lone first of January as a month bucket', () => {
    const rows = [{ month: '2026-01-01T00:00:00.000Z' }]
    const labels = createLabelFormatter({ name: 'month', kind: 'date' }, rows)

    expect(labels.short(rows[0].month)).toBe('Jan 2026')
  })

  it('falls back to the raw text for a value that is not a date', () => {
    const rows = [{ day: day(0) }, { day: 'soon' }, { day: null }]
    const labels = createLabelFormatter({ name: 'day', kind: 'date' }, rows)

    expect(labels.short('soon')).toBe('soon')
    expect(labels.short(null)).toBe('(empty)')
  })

  it('renders empty categories as (empty) and other values as text', () => {
    const labels = createLabelFormatter({ name: 'status', kind: 'text' }, [])

    expect(labels.short(null)).toBe('(empty)')
    expect(labels.short(undefined)).toBe('(empty)')
    expect(labels.short('')).toBe('(empty)')
    expect(labels.short(true)).toBe('true')
    expect(labels.long(42)).toBe('42')
    expect(labels.long({ tier: 'gold' })).toBe('{"tier":"gold"}')
  })
})

describe('shapeChart', () => {
  const weekColumns = [
    { name: 'week', kind: 'date' },
    { name: 'returns', kind: 'number' },
    { name: 'refunds', kind: 'number' },
  ]
  const weekRows = [
    { week: day(0), returns: 42, refunds: 7 },
    { week: day(7), returns: 31, refunds: null },
    { week: day(14), returns: 55, refunds: 12.5 },
  ]

  function chartOf(overrides) {
    return {
      type: 'bar',
      xKey: 'week',
      groupKey: null,
      series: [{ key: 'returns', label: 'Returns' }],
      stacked: false,
      ...overrides,
    }
  }

  describe('table and states', () => {
    it('treats a missing chart as a table', () => {
      expect(shapeChart(null, weekColumns, weekRows)).toEqual({ view: CHART_VIEW.TABLE })
    })

    it('treats the table type and an unknown type as a table', () => {
      expect(shapeChart(chartOf({ type: 'table', series: [] }), weekColumns, weekRows).view).toBe(CHART_VIEW.TABLE)
      expect(shapeChart(chartOf({ type: 'constructor' }), weekColumns, weekRows).view).toBe(CHART_VIEW.TABLE)
    })

    it('reports that no rows came back, whatever the chart', () => {
      expect(shapeChart(chartOf({}), weekColumns, [])).toEqual({ view: CHART_VIEW.STATE, message: 'No rows returned' })
      expect(shapeChart(null, weekColumns, [])).toEqual({ view: CHART_VIEW.STATE, message: 'No rows returned' })
    })

    it('reports a chart whose series column is gone', () => {
      const model = shapeChart(chartOf({ series: [{ key: 'gone', label: 'Gone' }] }), weekColumns, weekRows)

      expect(model).toEqual({
        view: CHART_VIEW.STATE,
        message: 'This chart needs columns the query no longer returns',
      })
    })

    it('reports a chart whose x, group or series is missing', () => {
      const broken = [
        chartOf({ xKey: 'month' }),
        chartOf({ groupKey: 'channel' }),
        chartOf({ series: [] }),
        chartOf({ type: 'pie', xKey: 'reason' }),
        chartOf({ type: 'number', xKey: null, series: [{ key: 'total', label: 'Total' }] }),
      ]

      broken.forEach(chart => {
        expect(shapeChart(chart, weekColumns, weekRows).view).toBe(CHART_VIEW.STATE)
      })
    })
  })

  describe('series without a group', () => {
    it('keeps one datum per row, in order, under generated keys', () => {
      const chart = chartOf({
        series: [
          { key: 'returns', label: 'Returns' },
          { key: 'refunds', label: '' },
        ],
      })
      const model = shapeChart(chart, weekColumns, weekRows)

      expect(model.view).toBe(CHART_VIEW.CARTESIAN)
      expect(model.type).toBe('bar')
      expect(model.series).toEqual([
        { key: 's0', label: 'Returns', color: 'var(--chart-1)' },
        { key: 's1', label: 'refunds', color: 'var(--chart-2)' },
      ])
      expect(model.data).toEqual([
        { [CATEGORY_KEY]: 'Mar 3', label: 'Mar 3, 2026', s0: 42, s1: 7 },
        { [CATEGORY_KEY]: 'Mar 10', label: 'Mar 10, 2026', s0: 31, s1: null },
        { [CATEGORY_KEY]: 'Mar 17', label: 'Mar 17, 2026', s0: 55, s1: 12.5 },
      ])
    })

    it('never plots more than eight series and never cycles a colour', () => {
      const keys = Array.from({ length: 10 }, (_, index) => `m${index}`)
      const columns = [{ name: 'week', kind: 'date' }, ...keys.map(name => ({ name, kind: 'number' }))]
      const rows = [Object.fromEntries([['week', day(0)], ...keys.map((key, index) => [key, index])])]
      const model = shapeChart(chartOf({ series: keys.map(key => ({ key, label: key })) }), columns, rows)

      expect(model.series.map(item => item.color)).toEqual([
        'var(--chart-1)',
        'var(--chart-2)',
        'var(--chart-3)',
        'var(--chart-4)',
        'var(--chart-5)',
        'var(--chart-6)',
        'var(--chart-7)',
        'var(--chart-8)',
      ])
    })

    it('reads numeric text and drops anything that is not a number', () => {
      const columns = [
        { name: 'name', kind: 'text' },
        { name: 'score', kind: 'text' },
      ]
      const rows = [
        { name: 'a', score: '12.5' },
        { name: 'b', score: 'n/a' },
        { name: 'c', score: ' ' },
        { name: 'd', score: true },
        { name: 'e', score: Infinity },
      ]
      const model = shapeChart(chartOf({ xKey: 'name', series: [{ key: 'score', label: 'Score' }] }), columns, rows)

      expect(model.data.map(datum => datum.s0)).toEqual([12.5, null, null, null, null])
    })

    it('labels a null category as (empty)', () => {
      const columns = [
        { name: 'product', kind: 'text' },
        { name: 'units', kind: 'number' },
      ]
      const rows = [
        { product: 'Desk', units: 4 },
        { product: null, units: 2 },
      ]
      const model = shapeChart(
        chartOf({ type: 'row', xKey: 'product', series: [{ key: 'units', label: 'Units' }] }),
        columns,
        rows
      )

      expect(model.data.map(datum => datum[CATEGORY_KEY])).toEqual(['Desk', '(empty)'])
    })

    it('stacks only stackable types with more than one series', () => {
      const two = [
        { key: 'returns', label: 'Returns' },
        { key: 'refunds', label: 'Refunds' },
      ]

      expect(shapeChart(chartOf({ stacked: true, series: two }), weekColumns, weekRows).isStacked).toBe(true)
      expect(shapeChart(chartOf({ stacked: true }), weekColumns, weekRows).isStacked).toBe(false)
      expect(shapeChart(chartOf({ type: 'line', stacked: true, series: two }), weekColumns, weekRows).isStacked).toBe(
        false
      )
      expect(shapeChart(chartOf({ stacked: false, series: two }), weekColumns, weekRows).isStacked).toBe(false)
    })

    it('summarises the type, the series and the number of points', () => {
      const two = [
        { key: 'returns', label: 'Returns' },
        { key: 'refunds', label: 'Refunds' },
      ]

      expect(shapeChart(chartOf({}), weekColumns, weekRows).summary).toBe('Bar chart of Returns with 3 points')
      expect(shapeChart(chartOf({ type: 'row' }), weekColumns, weekRows.slice(0, 1)).summary).toBe(
        'Horizontal bar chart of Returns with 1 point'
      )
      expect(shapeChart(chartOf({ type: 'area', stacked: true, series: two }), weekColumns, weekRows).summary).toBe(
        'Stacked area chart of Returns and Refunds with 3 points'
      )
    })

    it('flags fractional values so the axis may use decimals', () => {
      const two = [
        { key: 'returns', label: 'Returns' },
        { key: 'refunds', label: 'Refunds' },
      ]

      expect(shapeChart(chartOf({}), weekColumns, weekRows).hasDecimals).toBe(false)
      expect(shapeChart(chartOf({ series: two }), weekColumns, weekRows).hasDecimals).toBe(true)
    })

    it('writes ticks in full while the axis stays under ten thousand', () => {
      const model = shapeChart(chartOf({}), weekColumns, weekRows)

      expect(model.formatTick(1200)).toBe('1,200')
    })

    it('compacts every tick once a value reaches ten thousand', () => {
      const rows = [{ week: day(0), returns: 12000, refunds: 0 }]
      const model = shapeChart(chartOf({}), weekColumns, rows)

      expect(model.formatTick(12500)).toBe('12.5K')
      expect(model.formatTick(1250000)).toBe('1.25M')
      expect(model.formatTick(0)).toBe('0')
    })

    it('compacts ticks when a stack reaches ten thousand even if no single value does', () => {
      const rows = [{ week: day(0), returns: 6000, refunds: 5000 }]
      const two = [
        { key: 'returns', label: 'Returns' },
        { key: 'refunds', label: 'Refunds' },
      ]

      expect(shapeChart(chartOf({ series: two }), weekColumns, rows).formatTick(5000)).toBe('5,000')
      expect(shapeChart(chartOf({ series: two, stacked: true }), weekColumns, rows).formatTick(5000)).toBe('5K')
    })
  })

  describe('pivot by group', () => {
    const columns = [
      { name: 'week', kind: 'date' },
      { name: 'channel', kind: 'text' },
      { name: 'orders', kind: 'number' },
    ]
    const chart = chartOf({ groupKey: 'channel', series: [{ key: 'orders', label: 'Orders' }], stacked: true })

    it('builds one datum per x in first-appearance order with one field per group', () => {
      const rows = [
        { week: day(7), channel: 'web', orders: 5 },
        { week: day(0), channel: 'web', orders: 3 },
        { week: day(7), channel: 'slack', orders: 2 },
        { week: day(0), channel: 'web', orders: 4 },
      ]
      const model = shapeChart(chart, columns, rows)

      expect(model.series).toEqual([
        { key: 's0', label: 'slack', color: 'var(--chart-1)' },
        { key: 's1', label: 'web', color: 'var(--chart-2)' },
      ])
      expect(model.data).toEqual([
        { [CATEGORY_KEY]: 'Mar 10', label: 'Mar 10, 2026', s0: 2, s1: 5 },
        { [CATEGORY_KEY]: 'Mar 3', label: 'Mar 3, 2026', s0: 0, s1: 7 },
      ])
      expect(model.isStacked).toBe(true)
    })

    it('keeps the seven largest groups and folds the rest into Other', () => {
      const groups = ['kiwi', 'apple', 'fig', 'date', 'cherry', 'banana', 'grape', 'elder', 'honey', 'lime']
      const rows = groups.map((channel, index) => ({ week: day(0), channel, orders: 100 - index * 10 }))
      const model = shapeChart(chart, columns, rows)

      expect(model.series.map(item => item.label)).toEqual([
        'apple',
        'banana',
        'cherry',
        'date',
        'fig',
        'grape',
        'kiwi',
        'Other',
      ])
      expect(model.series.at(-1)).toEqual({ key: 'other', label: 'Other', color: 'var(--chart-other)' })
      expect(model.data[0].other).toBe(30 + 20 + 10)
      expect(model.data[0].s0).toBe(90)
    })

    it('colours by name order, so a change of rank does not repaint a series', () => {
      const before = [
        { week: day(0), channel: 'web', orders: 90 },
        { week: day(0), channel: 'slack', orders: 10 },
      ]
      const after = [
        { week: day(0), channel: 'web', orders: 10 },
        { week: day(0), channel: 'slack', orders: 90 },
      ]

      expect(shapeChart(chart, columns, before).series).toEqual(shapeChart(chart, columns, after).series)
    })

    it('orders group names naturally and names an empty group', () => {
      const rows = [
        { week: day(0), channel: 'v10', orders: 1 },
        { week: day(0), channel: 'v2', orders: 1 },
        { week: day(0), channel: null, orders: 1 },
      ]

      expect(shapeChart(chart, columns, rows).series.map(item => item.label)).toEqual(['(empty)', 'v2', 'v10'])
    })

    it('ranks groups by magnitude and counts a non-numeric value as zero', () => {
      const groups = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      const rows = groups.map((channel, index) => ({ week: day(0), channel, orders: index === 0 ? -500 : index }))
      const model = shapeChart(chart, columns, [...rows, { week: day(0), channel: 'h', orders: 'n/a' }])

      expect(model.series.map(item => item.label)).toEqual(['a', 'c', 'd', 'e', 'f', 'g', 'h', 'Other'])
      expect(model.data[0].s0).toBe(-500)
      expect(model.data[0].other).toBe(1)
    })

    it('treats an object x value by its content', () => {
      const objectColumns = [{ name: 'week', kind: 'text' }, columns[1], columns[2]]
      const rows = [
        { week: { id: 1 }, channel: 'web', orders: 1 },
        { week: { id: 1 }, channel: 'web', orders: 2 },
      ]
      const model = shapeChart(chart, objectColumns, rows)

      expect(model.data).toEqual([{ [CATEGORY_KEY]: '{"id":1}', label: '{"id":1}', s0: 3 }])
    })
  })

  describe('pie', () => {
    const columns = [
      { name: 'reason', kind: 'text' },
      { name: 'returns', kind: 'number' },
    ]
    const chart = chartOf({ type: 'pie', xKey: 'reason' })

    it('draws one slice per category in row order with its share', () => {
      const rows = [
        { reason: 'Size', returns: 60 },
        { reason: 'Damaged', returns: 30 },
        { reason: null, returns: 10 },
      ]
      const model = shapeChart(chart, columns, rows)

      expect(model.view).toBe(CHART_VIEW.PIE)
      expect(model.slices).toEqual([
        { key: 's0', label: 'Size', value: 60, share: 0.6, color: 'var(--chart-1)', fill: 'var(--chart-1)' },
        { key: 's1', label: 'Damaged', value: 30, share: 0.3, color: 'var(--chart-2)', fill: 'var(--chart-2)' },
        { key: 's2', label: '(empty)', value: 10, share: 0.1, color: 'var(--chart-3)', fill: 'var(--chart-3)' },
      ])
      expect(model.series).toEqual([{ key: 'value', label: 'Returns' }])
      expect(model.summary).toBe('Donut chart of Returns with 3 slices')
    })

    it('keeps six slices at most, folding the smallest into Other', () => {
      const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((reason, index) => ({ reason, returns: index + 1 }))
      const model = shapeChart(chart, columns, rows)

      expect(model.slices.map(slice => slice.label)).toEqual(['d', 'e', 'f', 'g', 'h', 'Other'])
      expect(model.slices.map(slice => slice.value)).toEqual([4, 5, 6, 7, 8, 6])
      expect(model.slices.at(-1)).toMatchObject({
        key: 'other',
        color: 'var(--chart-other)',
        fill: 'var(--chart-other)',
      })
      expect(model.slices.map(slice => slice.color).slice(0, 5)).toEqual([
        'var(--chart-1)',
        'var(--chart-2)',
        'var(--chart-3)',
        'var(--chart-4)',
        'var(--chart-5)',
      ])
    })

    it('shows exactly six categories without an Other slice', () => {
      const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((reason, index) => ({ reason, returns: index + 1 }))

      expect(shapeChart(chart, columns, rows).slices.map(slice => slice.label)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    })

    it('adds up repeated categories and leaves out what cannot be a slice', () => {
      const rows = [
        { reason: 'Size', returns: 5 },
        { reason: 'Size', returns: 15 },
        { reason: 'Refund', returns: -4 },
        { reason: 'Unknown', returns: null },
      ]
      const model = shapeChart(chart, columns, rows)

      expect(model.slices).toHaveLength(1)
      expect(model.slices[0]).toMatchObject({ label: 'Size', value: 20, share: 1 })
      expect(model.summary).toBe('Donut chart of Returns with 1 slice')
    })

    it('falls back to the column name when the series has no label', () => {
      const unnamed = chartOf({ type: 'pie', xKey: 'reason', series: [{ key: 'returns', label: '' }] })
      const model = shapeChart(unnamed, columns, [{ reason: 'Size', returns: 5 }])

      expect(model.series).toEqual([{ key: 'value', label: 'returns' }])
    })

    it('says so when there is nothing positive to plot', () => {
      const rows = [{ reason: 'Size', returns: 0 }]

      expect(shapeChart(chart, columns, rows)).toEqual({ view: CHART_VIEW.STATE, message: 'No values to plot' })
    })
  })

  describe('number', () => {
    const chart = chartOf({ type: 'number', xKey: null, series: [{ key: 'total', label: 'Open tickets' }] })

    it('takes the first row and ignores the rest', () => {
      const model = shapeChart(chart, [{ name: 'total', kind: 'number' }], [{ total: 12949 }, { total: 1 }])

      expect(model).toEqual({ view: CHART_VIEW.NUMBER, label: 'Open tickets', value: 12949 })
    })

    it('falls back to the column name when the label is empty', () => {
      const unnamed = chartOf({ type: 'number', xKey: null, series: [{ key: 'total', label: '' }] })

      expect(shapeChart(unnamed, [{ name: 'total', kind: 'number' }], [{ total: 3 }]).label).toBe('total')
    })

    it('keeps a value that is not a number as text', () => {
      const text = shapeChart(chart, [{ name: 'total', kind: 'text' }], [{ total: 'Home & Garden' }])
      const date = shapeChart(chart, [{ name: 'total', kind: 'date' }], [{ total: '2026-03-03T14:00:00.000Z' }])
      const empty = shapeChart(chart, [{ name: 'total', kind: 'number' }], [{ total: null }])

      expect(text.value).toBe('Home & Garden')
      expect(date.value).toBe('Mar 3, 2026, 14:00')
      expect(empty.value).toBe('—')
    })
  })
})
