import { describe, it, expect } from 'vitest'
import {
  MAX_SERIES,
  changeGroupKey,
  changeStacked,
  changeType,
  changeValue,
  changeXKey,
  groupColumns,
  hasAxis,
  hasSeries,
  hasValues,
  isStackable,
  toggleSeries,
  valueColumns,
} from './chart-draft.js'

const COLUMNS = [
  { name: 'week', kind: 'date' },
  { name: 'country', kind: 'text' },
  { name: 'orders', kind: 'number' },
  { name: 'total_revenue', kind: 'number' },
]

const BAR = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'orders', label: 'Orders placed' }],
  stacked: true,
}

const TABLE = { type: 'table', xKey: null, groupKey: null, series: [], stacked: false }

describe('chart-draft', () => {
  describe('what each type uses', () => {
    it.each([
      ['bar', { axis: true, series: true, values: true, stackable: true }],
      ['row', { axis: true, series: true, values: true, stackable: true }],
      ['line', { axis: true, series: true, values: true, stackable: false }],
      ['area', { axis: true, series: true, values: true, stackable: true }],
      ['pie', { axis: true, series: false, values: true, stackable: false }],
      ['number', { axis: false, series: false, values: true, stackable: false }],
      ['table', { axis: false, series: false, values: false, stackable: false }],
    ])('%s', (type, uses) => {
      expect(hasAxis(type)).toBe(uses.axis)
      expect(hasSeries(type)).toBe(uses.series)
      expect(hasValues(type)).toBe(uses.values)
      expect(isStackable(type)).toBe(uses.stackable)
    })
  })

  describe('changeType', () => {
    it('keeps the axis, the values and the stacking between types that share them', () => {
      expect(changeType(BAR, 'area', COLUMNS)).toEqual({ ...BAR, type: 'area' })
    })

    it('drops the stacking for a type that cannot stack', () => {
      expect(changeType(BAR, 'line', COLUMNS)).toEqual({ ...BAR, type: 'line', stacked: false })
    })

    it('keeps only the first value and no group for a pie', () => {
      const grouped = { ...BAR, groupKey: 'country' }
      const multi = { ...BAR, series: [...BAR.series, { key: 'total_revenue', label: 'Revenue' }] }

      expect(changeType(grouped, 'pie', COLUMNS)).toEqual({ ...BAR, type: 'pie', stacked: false })
      expect(changeType(multi, 'pie', COLUMNS).series).toEqual(BAR.series)
    })

    it('keeps only the headline value for a number', () => {
      expect(changeType(BAR, 'number', COLUMNS)).toEqual({
        type: 'number',
        xKey: null,
        groupKey: null,
        series: BAR.series,
        stacked: false,
      })
    })

    it('clears everything for a table', () => {
      expect(changeType({ ...BAR, groupKey: 'country' }, 'table', COLUMNS)).toEqual(TABLE)
    })

    it('fills the axis with the first column that is not a number and the value with the first number', () => {
      expect(changeType(TABLE, 'bar', COLUMNS)).toEqual({
        type: 'bar',
        xKey: 'week',
        groupKey: null,
        series: [{ key: 'orders', label: 'Orders' }],
        stacked: false,
      })
    })

    it('falls back to the first column for the axis when every column is a number', () => {
      const numbers = [
        { name: 'year', kind: 'number' },
        { name: 'total_revenue', kind: 'number' },
      ]

      expect(changeType(TABLE, 'line', numbers)).toEqual({
        type: 'line',
        xKey: 'year',
        groupKey: null,
        series: [{ key: 'total_revenue', label: 'Total revenue' }],
        stacked: false,
      })
    })

    it('leaves the values empty when the result has no number to plot', () => {
      const texts = [{ name: 'country', kind: 'text' }]

      expect(changeType(TABLE, 'bar', texts)).toEqual({ ...TABLE, type: 'bar', xKey: 'country' })
    })

    it('still changes the type before the columns are known', () => {
      expect(changeType(TABLE, 'bar', [])).toEqual({ ...TABLE, type: 'bar' })
    })
  })

  describe('changeXKey', () => {
    it('moves the axis to another column', () => {
      expect(changeXKey(BAR, 'country', COLUMNS)).toEqual({ ...BAR, xKey: 'country' })
    })

    it('stops plotting the column that became the axis and falls back to another number', () => {
      expect(changeXKey(BAR, 'orders', COLUMNS)).toEqual({
        ...BAR,
        xKey: 'orders',
        series: [{ key: 'total_revenue', label: 'Total revenue' }],
      })
    })

    it('stops grouping by the column that became the axis', () => {
      expect(changeXKey({ ...BAR, groupKey: 'country' }, 'country', COLUMNS)).toEqual({ ...BAR, xKey: 'country' })
    })
  })

  describe('toggleSeries', () => {
    it('adds a value with a readable label', () => {
      expect(toggleSeries(BAR, 'total_revenue').series).toEqual([
        { key: 'orders', label: 'Orders placed' },
        { key: 'total_revenue', label: 'Total revenue' },
      ])
    })

    it('removes a value', () => {
      const multi = toggleSeries(BAR, 'total_revenue')

      expect(toggleSeries(multi, 'orders').series).toEqual([{ key: 'total_revenue', label: 'Total revenue' }])
    })

    it('keeps the last value checked', () => {
      expect(toggleSeries(BAR, 'orders')).toBe(BAR)
    })

    it('stops at eight values', () => {
      const full = {
        ...BAR,
        series: Array.from({ length: MAX_SERIES }, (_, index) => ({ key: `m${index}`, label: `M${index}` })),
      }

      expect(toggleSeries(full, 'orders')).toBe(full)
    })
  })

  describe('changeValue', () => {
    it('replaces the single value', () => {
      expect(changeValue({ ...BAR, type: 'pie' }, 'total_revenue').series).toEqual([
        { key: 'total_revenue', label: 'Total revenue' },
      ])
    })

    it('keeps the label of a value that was already plotted', () => {
      const multi = { ...BAR, series: [{ key: 'total_revenue', label: 'Revenue' }, ...BAR.series] }

      expect(changeValue(multi, 'orders').series).toEqual([{ key: 'orders', label: 'Orders placed' }])
    })
  })

  describe('changeGroupKey', () => {
    it('groups by a column and keeps only the first value', () => {
      const multi = toggleSeries(BAR, 'total_revenue')

      expect(changeGroupKey(multi, 'country')).toEqual({ ...BAR, groupKey: 'country' })
    })

    it('stops grouping when none is chosen', () => {
      expect(changeGroupKey({ ...BAR, groupKey: 'country' }, '')).toEqual(BAR)
    })
  })

  describe('changeStacked', () => {
    it('turns the stacking on and off', () => {
      expect(changeStacked(BAR, false)).toEqual({ ...BAR, stacked: false })
      expect(changeStacked({ ...BAR, stacked: false }, true)).toEqual(BAR)
    })
  })

  describe('valueColumns', () => {
    it('offers the number columns that are neither the axis nor the group', () => {
      const numbers = [...COLUMNS, { name: 'year', kind: 'number' }, { name: 'tier', kind: 'number' }]
      const chart = { ...BAR, xKey: 'year', groupKey: 'tier' }

      expect(valueColumns(chart, numbers).map(column => column.name)).toEqual(['orders', 'total_revenue'])
    })
  })

  describe('groupColumns', () => {
    it('offers the columns that are neither the axis nor a value', () => {
      expect(groupColumns(BAR, COLUMNS).map(column => column.name)).toEqual(['country', 'total_revenue'])
    })
  })
})
