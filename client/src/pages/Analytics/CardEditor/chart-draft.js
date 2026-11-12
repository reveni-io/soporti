export const MAX_SERIES = 8

const AXIS_TYPES = ['bar', 'row', 'line', 'area', 'pie']
const SERIES_TYPES = ['bar', 'row', 'line', 'area']
const STACKABLE_TYPES = ['bar', 'row', 'area']
const TABLE_TYPE = 'table'
const NUMBER_KIND = 'number'
const WORD_SEPARATOR_RE = /[_\-\s]+/g

export function hasAxis(type) {
  return AXIS_TYPES.includes(type)
}

export function hasSeries(type) {
  return SERIES_TYPES.includes(type)
}

export function hasValues(type) {
  return type !== TABLE_TYPE
}

export function isStackable(type) {
  return STACKABLE_TYPES.includes(type)
}

function toLabel(key) {
  const words = key.replace(WORD_SEPARATOR_RE, ' ').trim()
  if (!words) return key

  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function toSeries(key) {
  return { key, label: toLabel(key) }
}

function seriesKeys(chart) {
  return chart.series.map(entry => entry.key)
}

function defaultXKey(columns) {
  const category = columns.find(column => column.kind !== NUMBER_KIND) ?? columns[0]

  return category?.name ?? null
}

function defaultSeries(columns, xKey) {
  const measure = columns.find(column => column.kind === NUMBER_KIND && column.name !== xKey)

  return measure ? [toSeries(measure.name)] : []
}

function resolveSeries(chart, columns) {
  if (!hasValues(chart.type)) return []

  const kept = chart.series.filter(entry => entry.key !== chart.xKey)
  const series = kept.length > 0 ? kept : defaultSeries(columns, chart.xKey)
  const isSingle = !hasSeries(chart.type) || Boolean(chart.groupKey)

  return isSingle ? series.slice(0, 1) : series
}

export function valueColumns(chart, columns) {
  return columns.filter(
    column => column.kind === NUMBER_KIND && column.name !== chart.xKey && column.name !== chart.groupKey
  )
}

export function groupColumns(chart, columns) {
  const taken = [chart.xKey, ...seriesKeys(chart)]

  return columns.filter(column => !taken.includes(column.name))
}

export function changeType(chart, type, columns) {
  const next = {
    ...chart,
    type,
    xKey: hasAxis(type) ? (chart.xKey ?? defaultXKey(columns)) : null,
    groupKey: hasSeries(type) ? chart.groupKey : null,
    stacked: isStackable(type) && chart.stacked,
  }

  return { ...next, series: resolveSeries(next, columns) }
}

export function changeXKey(chart, xKey, columns) {
  const next = { ...chart, xKey, groupKey: chart.groupKey === xKey ? null : chart.groupKey }

  return { ...next, series: resolveSeries(next, columns) }
}

export function toggleSeries(chart, key) {
  const isSelected = seriesKeys(chart).includes(key)

  if (isSelected && chart.series.length === 1) return chart
  if (isSelected) return { ...chart, series: chart.series.filter(entry => entry.key !== key) }
  if (chart.series.length >= MAX_SERIES) return chart

  return { ...chart, series: [...chart.series, toSeries(key)] }
}

export function changeValue(chart, key) {
  const current = chart.series.find(entry => entry.key === key)

  return { ...chart, series: [current ?? toSeries(key)] }
}

export function changeGroupKey(chart, groupKey) {
  if (!groupKey) return { ...chart, groupKey: null }

  return { ...chart, groupKey, series: chart.series.slice(0, 1) }
}

export function changeStacked(chart, stacked) {
  return { ...chart, stacked }
}
