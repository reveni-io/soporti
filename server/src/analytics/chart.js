import { ANALYTICS_KIND_NUMBER } from '../constants.js'

export const CHART_TYPES = ['bar', 'row', 'line', 'area', 'pie', 'number', 'table']

const TYPE_TABLE = 'table'
const TYPE_NUMBER = 'number'
const TYPE_PIE = 'pie'
const STACKABLE_TYPES = new Set(['bar', 'row', 'area'])
const MAX_SERIES = 8
const MAX_KEY_LENGTH = 100
const MAX_LABEL_LENGTH = 80
const WORD_SEPARATOR_RE = /[_\-\s]+/g

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function humanizeKey(key) {
  const words = key.replace(WORD_SEPARATOR_RE, ' ').trim()
  if (!words) return key

  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function cleanLabel(label) {
  return typeof label === 'string' ? label.trim().slice(0, MAX_LABEL_LENGTH) : ''
}

function toSeriesEntry({ key, label }) {
  return { key, label: cleanLabel(label) || humanizeKey(key) }
}

function isKey(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH
}

function parseKey(value, field) {
  if (value === undefined || value === null || value === '') return { value: null }
  if (!isKey(value)) {
    return { error: `The chart ${field} must be a column name of at most ${MAX_KEY_LENGTH} characters.` }
  }

  return { value }
}

function isSeriesItem(item) {
  if (!isPlainObject(item) || !isKey(item.key)) return false
  if (item.label === undefined || item.label === null) return true

  return typeof item.label === 'string' && item.label.length <= MAX_LABEL_LENGTH
}

function parseSeries(value) {
  if (value === undefined || value === null) return { value: [] }
  if (!Array.isArray(value) || value.length > MAX_SERIES) {
    return { error: `The chart series must be a list of up to ${MAX_SERIES} columns.` }
  }
  if (!value.every(isSeriesItem)) {
    return {
      error: `Every chart series needs a column key of at most ${MAX_KEY_LENGTH} characters and an optional label of at most ${MAX_LABEL_LENGTH}.`,
    }
  }

  return { value: value.map(toSeriesEntry) }
}

function parseChartKeys(chart) {
  const xKey = parseKey(chart.xKey, 'xKey')
  if (xKey.error) return xKey

  const groupKey = parseKey(chart.groupKey, 'groupKey')
  if (groupKey.error) return groupKey

  const series = parseSeries(chart.series)
  if (series.error) return series

  return { value: { xKey: xKey.value, groupKey: groupKey.value, series: series.value } }
}

export function parseChart(value) {
  if (value === undefined || value === null) return { value: null }
  if (!isPlainObject(value)) return { error: 'The chart must be an object.' }
  if (!CHART_TYPES.includes(value.type)) return { error: `The chart type must be one of: ${CHART_TYPES.join(', ')}.` }
  if (value.stacked !== undefined && typeof value.stacked !== 'boolean') {
    return { error: 'The chart stacked option must be true or false.' }
  }

  const keys = parseChartKeys(value)
  if (keys.error) return keys

  return { value: { type: value.type, ...keys.value, stacked: value.stacked === true } }
}

function tableChart() {
  return { type: TYPE_TABLE, xKey: null, groupKey: null, series: [], stacked: false }
}

function hasColumn(columns, name) {
  return columns.some(column => column.name === name)
}

function numberColumnNames(columns) {
  return columns.filter(column => column.kind === ANALYTICS_KIND_NUMBER).map(column => column.name)
}

function submittedSeries(chart) {
  return Array.isArray(chart.series) ? chart.series.filter(isPlainObject) : []
}

function keepSeries(series, allowedKeys) {
  const kept = new Map()
  for (const entry of series) {
    if (allowedKeys.includes(entry.key) && !kept.has(entry.key)) kept.set(entry.key, toSeriesEntry(entry))
  }

  return [...kept.values()]
}

function reconcileNumber(chart, columns) {
  const numbers = numberColumnNames(columns)
  if (numbers.length === 0) return tableChart()

  const [headline] = keepSeries(submittedSeries(chart).slice(0, 1), numbers)

  return {
    type: TYPE_NUMBER,
    xKey: null,
    groupKey: null,
    series: [headline ?? toSeriesEntry({ key: numbers[0] })],
    stacked: false,
  }
}

function resolveXKey(xKey, columns) {
  if (hasColumn(columns, xKey)) return xKey

  const category = columns.find(column => column.kind !== ANALYTICS_KIND_NUMBER) ?? columns[0]

  return category?.name ?? null
}

function resolveGroupKey(chart, { type, xKey, seriesKeys, columns }) {
  const { groupKey } = chart
  if (type === TYPE_PIE || groupKey === xKey || seriesKeys.includes(groupKey)) return null

  return hasColumn(columns, groupKey) ? groupKey : null
}

function reconcilePlot(chart, type, columns) {
  const xKey = resolveXKey(chart.xKey, columns)
  const measures = numberColumnNames(columns).filter(name => name !== xKey)
  const kept = keepSeries(submittedSeries(chart), measures)
  const groupKey = resolveGroupKey(chart, { type, xKey, seriesKeys: kept.map(entry => entry.key), columns })
  const fallback = measures.filter(name => name !== groupKey).map(key => toSeriesEntry({ key }))
  const maxSeries = groupKey || type === TYPE_PIE ? 1 : MAX_SERIES
  const series = (kept.length > 0 ? kept : fallback).slice(0, maxSeries)
  if (series.length === 0) return tableChart()

  return { type, xKey, groupKey, series, stacked: STACKABLE_TYPES.has(type) && chart.stacked === true }
}

export function reconcileChart(chart, columns) {
  const type = CHART_TYPES.includes(chart?.type) ? chart.type : TYPE_TABLE
  if (type === TYPE_TABLE) return tableChart()
  if (type === TYPE_NUMBER) return reconcileNumber(chart, columns)

  return reconcilePlot(chart, type, columns)
}
