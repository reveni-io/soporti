const LOCALE = 'en-US'
const TIME_ZONE = 'UTC'
const MS_PER_DAY = 86_400_000
const COMPACT_THRESHOLD = 10_000
const MAX_SERIES = 8
const MAX_GROUPS = 7
const MAX_SLICES = 6
const MAX_TICK_LABEL_LENGTH = 18
const NARROW_TICK_LABEL_LENGTH = 10
const ELLIPSIS = '…'
const EMPTY_CATEGORY_LABEL = '(empty)'
const NULL_VALUE_TEXT = '—'
const OTHER_LABEL = 'Other'
const OTHER_KEY = 'other'
const OTHER_COLOR = 'var(--chart-other)'
const SLICE_VALUE_KEY = 'value'
const NO_ROWS_MESSAGE = 'No rows returned'
const MISSING_COLUMNS_MESSAGE = 'This chart needs columns the query no longer returns'
const NO_VALUES_MESSAGE = 'No values to plot'
const STACKABLE_TYPES = new Set(['bar', 'row', 'area'])
const CHART_NAMES = { bar: 'Bar chart', row: 'Horizontal bar chart', line: 'Line chart', area: 'Area chart' }
const PIE_NAME = 'Donut chart'

const DATE_PARTS = {
  year: { year: 'numeric' },
  month: { month: 'short', year: 'numeric' },
  day: { month: 'short', day: 'numeric' },
  time: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
}

const FULL_FORMAT = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })
const FRACTION_FORMAT = new Intl.NumberFormat(LOCALE, { maximumSignificantDigits: 4 })
const COMPACT_FORMAT = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
const COMPACT_TICK_FORMAT = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 2 })
const SHARE_FORMAT = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })
const LIST_FORMAT = new Intl.ListFormat(LOCALE, { style: 'long', type: 'conjunction' })

export const CATEGORY_KEY = 'x'
export const SURFACE_COLOR = 'var(--bg-surface)'
export const CHART_ANIMATION_MS = 400
export const CHART_VIEW = { STATE: 'state', TABLE: 'table', NUMBER: 'number', PIE: 'pie', CARTESIAN: 'cartesian' }

export function formatNumber(value) {
  if (Math.abs(value) < 1) return FRACTION_FORMAT.format(value)

  return FULL_FORMAT.format(value)
}

export function formatCompactNumber(value) {
  if (Math.abs(value) < COMPACT_THRESHOLD) return formatNumber(value)

  return COMPACT_FORMAT.format(value)
}

export function formatShare(ratio) {
  return SHARE_FORMAT.format(ratio)
}

function truncate(text, limit) {
  if (text.length <= limit) return text

  return `${text.slice(0, limit - 1).trimEnd()}${ELLIPSIS}`
}

export function truncateLabel(label) {
  return truncate(String(label), MAX_TICK_LABEL_LENGTH)
}

export function truncateNarrowLabel(label) {
  return truncate(String(label), NARROW_TICK_LABEL_LENGTH)
}

function formatCompactTick(value) {
  return COMPACT_TICK_FORMAT.format(value)
}

function formatCategory(value) {
  if (value === null || value === undefined || value === '') return EMPTY_CATEGORY_LABEL
  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}

function parseTimestamp(value) {
  return typeof value === 'string' ? Date.parse(value) : NaN
}

function inferGranularity(timestamps) {
  if (timestamps.some(timestamp => timestamp % MS_PER_DAY !== 0)) return 'time'

  const dates = timestamps.map(timestamp => new Date(timestamp))

  if (dates.some(date => date.getUTCDate() !== 1)) return 'day'

  const isYearly = new Set(timestamps).size > 1 && dates.every(date => date.getUTCMonth() === 0)

  return isYearly ? 'year' : 'month'
}

function createDateFormatter(parts) {
  const format = new Intl.DateTimeFormat(LOCALE, { ...parts, timeZone: TIME_ZONE })

  return value => {
    const timestamp = parseTimestamp(value)

    return Number.isFinite(timestamp) ? format.format(timestamp) : formatCategory(value)
  }
}

export function createLabelFormatter(column, rows) {
  if (column.kind !== 'date') return { short: formatCategory, long: formatCategory }

  const timestamps = rows.map(row => parseTimestamp(row[column.name])).filter(Number.isFinite)
  const parts = DATE_PARTS[inferGranularity(timestamps)]
  const datedParts = { ...parts, year: 'numeric' }
  const spansYears = new Set(timestamps.map(timestamp => new Date(timestamp).getUTCFullYear())).size > 1

  return { short: createDateFormatter(spansYears ? datedParts : parts), long: createDateFormatter(datedParts) }
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0)
}

function seriesKey(index) {
  return `s${index}`
}

function slotColor(index) {
  return `var(--chart-${index + 1})`
}

function findColumn(columns, name) {
  return columns.find(column => column.name === name)
}

function identityOf(value) {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : value
}

function compareLabels(first, second) {
  return first.localeCompare(second, LOCALE, { numeric: true })
}

function pluralize(count, unit) {
  return `${formatNumber(count)} ${count === 1 ? unit : `${unit}s`}`
}

function createDatum(value, labels) {
  return { [CATEGORY_KEY]: labels.short(value), label: labels.long(value) }
}

function spreadRows(chart, rows, labels) {
  const columns = chart.series.slice(0, MAX_SERIES)
  const series = columns.map((item, index) => {
    return { key: seriesKey(index), label: item.label || item.key, color: slotColor(index) }
  })
  const data = rows.map(row => {
    const datum = createDatum(row[chart.xKey], labels)

    columns.forEach((item, index) => {
      datum[seriesKey(index)] = toNumber(row[item.key])
    })

    return datum
  })

  return { data, series }
}

function collectGroups(chart, rows, labels) {
  const valueKey = chart.series[0].key
  const buckets = new Map()
  const totals = new Map()

  rows.forEach(row => {
    const value = toNumber(row[valueKey]) ?? 0
    const group = labels.group(row[chart.groupKey])
    const bucketId = identityOf(row[chart.xKey])

    if (!buckets.has(bucketId))
      buckets.set(bucketId, { datum: createDatum(row[chart.xKey], labels), values: new Map() })

    const { values } = buckets.get(bucketId)

    values.set(group, (values.get(group) ?? 0) + value)
    totals.set(group, (totals.get(group) ?? 0) + Math.abs(value))
  })

  return { buckets: [...buckets.values()], totals }
}

function rankGroups(totals) {
  const ranked = [...totals.keys()].sort((first, second) => totals.get(second) - totals.get(first))
  const kept = ranked.slice(0, MAX_GROUPS).sort(compareLabels)
  const series = kept.map((label, index) => ({ key: seriesKey(index), label, color: slotColor(index) }))

  if (ranked.length > MAX_GROUPS) series.push({ key: OTHER_KEY, label: OTHER_LABEL, color: OTHER_COLOR })

  return { series, keyByGroup: new Map(kept.map((label, index) => [label, seriesKey(index)])) }
}

function pivotRows(chart, columns, rows, labels) {
  const group = createLabelFormatter(findColumn(columns, chart.groupKey), rows).long
  const { buckets, totals } = collectGroups(chart, rows, { ...labels, group })
  const { series, keyByGroup } = rankGroups(totals)
  const data = buckets.map(bucket => {
    const datum = { ...bucket.datum }

    series.forEach(item => {
      datum[item.key] = 0
    })
    bucket.values.forEach((value, label) => {
      datum[keyByGroup.get(label) ?? OTHER_KEY] += value
    })

    return datum
  })

  return { data, series }
}

function findPeak(data, series, isStacked) {
  return data.reduce((peak, datum) => {
    const magnitudes = series.map(item => Math.abs(datum[item.key] ?? 0))

    return Math.max(peak, isStacked ? sum(magnitudes) : Math.max(...magnitudes))
  }, 0)
}

function hasFractions(data, series) {
  return data.some(datum => series.some(item => !Number.isInteger(datum[item.key] ?? 0)))
}

function describeChart(name, labels, size) {
  return `${name} of ${LIST_FORMAT.format(labels)} with ${size}`
}

function shapeCartesian(chart, columns, rows) {
  const labels = createLabelFormatter(findColumn(columns, chart.xKey), rows)
  const { data, series } = chart.groupKey ? pivotRows(chart, columns, rows, labels) : spreadRows(chart, rows, labels)
  const isStacked = chart.stacked === true && STACKABLE_TYPES.has(chart.type) && series.length > 1
  const name = isStacked ? `Stacked ${CHART_NAMES[chart.type].toLowerCase()}` : CHART_NAMES[chart.type]
  const seriesLabels = series.map(item => item.label)

  return {
    view: CHART_VIEW.CARTESIAN,
    type: chart.type,
    data,
    series,
    isStacked,
    hasDecimals: hasFractions(data, series),
    formatTick: findPeak(data, series, isStacked) >= COMPACT_THRESHOLD ? formatCompactTick : formatNumber,
    summary: describeChart(name, seriesLabels, pluralize(data.length, 'point')),
  }
}

function foldSlices(entries) {
  if (entries.length <= MAX_SLICES) return entries

  const ranked = [...entries].sort((first, second) => second.value - first.value)
  const top = new Set(ranked.slice(0, MAX_SLICES - 1))
  const kept = entries.filter(entry => top.has(entry))
  const rest = entries.filter(entry => !top.has(entry))

  return [...kept, { label: OTHER_LABEL, value: sum(rest.map(entry => entry.value)), isOther: true }]
}

function collectSlices(chart, columns, rows) {
  const format = createLabelFormatter(findColumn(columns, chart.xKey), rows).long
  const valueKey = chart.series[0].key
  const totals = new Map()

  rows.forEach(row => {
    const label = format(row[chart.xKey])

    totals.set(label, (totals.get(label) ?? 0) + (toNumber(row[valueKey]) ?? 0))
  })

  return [...totals].map(([label, value]) => ({ label, value })).filter(entry => entry.value > 0)
}

function shapePie(chart, columns, rows) {
  const entries = foldSlices(collectSlices(chart, columns, rows))

  if (entries.length === 0) return { view: CHART_VIEW.STATE, message: NO_VALUES_MESSAGE }

  const total = sum(entries.map(entry => entry.value))
  const label = chart.series[0].label || chart.series[0].key
  const slices = entries.map((entry, index) => {
    const color = entry.isOther ? OTHER_COLOR : slotColor(index)

    return {
      key: entry.isOther ? OTHER_KEY : seriesKey(index),
      label: entry.label,
      [SLICE_VALUE_KEY]: entry.value,
      share: entry.value / total,
      color,
      fill: color,
    }
  })

  return {
    view: CHART_VIEW.PIE,
    slices,
    series: [{ key: SLICE_VALUE_KEY, label }],
    summary: describeChart(PIE_NAME, [label], pluralize(slices.length, 'slice')),
  }
}

function shapeNumber(chart, columns, rows) {
  const { key, label } = chart.series[0]
  const raw = rows[0][key]
  const format = createLabelFormatter(findColumn(columns, key), rows.slice(0, 1)).long
  const text = raw === null || raw === undefined ? NULL_VALUE_TEXT : format(raw)

  return { view: CHART_VIEW.NUMBER, label: label || key, value: typeof raw === 'number' ? raw : text }
}

const SHAPERS = new Map([
  ['bar', shapeCartesian],
  ['row', shapeCartesian],
  ['line', shapeCartesian],
  ['area', shapeCartesian],
  ['pie', shapePie],
  ['number', shapeNumber],
])

function requiredKeys(chart) {
  const valueKey = chart.series[0].key

  if (chart.type === 'number') return [valueKey]
  if (chart.type === 'pie') return [chart.xKey, valueKey]
  if (chart.groupKey) return [chart.xKey, chart.groupKey, valueKey]

  return [chart.xKey, ...chart.series.slice(0, MAX_SERIES).map(item => item.key)]
}

function hasRequiredColumns(chart, columns) {
  const names = new Set(columns.map(column => column.name))

  return chart.series.length > 0 && requiredKeys(chart).every(key => names.has(key))
}

export function shapeChart(chart, columns, rows) {
  const shape = SHAPERS.get(chart?.type)

  if (rows.length === 0) return { view: CHART_VIEW.STATE, message: NO_ROWS_MESSAGE }
  if (!shape) return { view: CHART_VIEW.TABLE }
  if (!hasRequiredColumns(chart, columns)) return { view: CHART_VIEW.STATE, message: MISSING_COLUMNS_MESSAGE }

  return shape(chart, columns, rows)
}
