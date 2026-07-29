import { EMPTY_CELL } from '../../../constants.js'

const COUNT_FORMAT = new Intl.NumberFormat('en-US')
const COMPACT_FORMAT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const MS_IN_SECOND = 1000

export function formatCount(value) {
  if (value == null) return EMPTY_CELL

  return COUNT_FORMAT.format(value)
}

export function formatTokens(value) {
  if (value == null) return EMPTY_CELL

  return COMPACT_FORMAT.format(value)
}

export function formatDuration(ms) {
  if (!ms) return EMPTY_CELL

  return `${(ms / MS_IN_SECOND).toFixed(1)}s`
}

export function formatPercent(part, total) {
  if (!total) return EMPTY_CELL

  return `${Math.round((part / total) * 100)}%`
}
