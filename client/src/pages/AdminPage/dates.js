import { EMPTY_CELL } from '../../constants.js'

const DATE_TIME_FORMAT = { dateStyle: 'medium', timeStyle: 'short' }

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)

  return isNaN(date) ? null : date
}

export function formatDate(value) {
  const date = parseDate(value)

  return date ? date.toLocaleDateString() : EMPTY_CELL
}

export function formatDateTime(value) {
  const date = parseDate(value)

  return date ? date.toLocaleString([], DATE_TIME_FORMAT) : EMPTY_CELL
}
