import { MAX_ANALYTICS_CARDS_PER_DASHBOARD, UUID_RE } from '../constants.js'

const GRID_COLUMNS = 12
const MAX_CARD_HEIGHT = 24
const INVALID_ITEMS_ERROR = `Items must be a list of up to ${MAX_ANALYTICS_CARDS_PER_DASHBOARD} card positions.`
const INVALID_ID_ERROR = 'Every card position needs a valid card ID.'
const INVALID_POSITION_ERROR = `Every card position must fit the ${GRID_COLUMNS}-column grid: x from 0 to ${GRID_COLUMNS - 1}, w from 1 to ${GRID_COLUMNS} with x + w at most ${GRID_COLUMNS}, h from 1 to ${MAX_CARD_HEIGHT} and y at least 0.`

function isIntegerBetween(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max
}

function fitsGrid({ x, y, w, h }) {
  return (
    isIntegerBetween(x, 0, GRID_COLUMNS - 1) &&
    isIntegerBetween(w, 1, GRID_COLUMNS - x) &&
    isIntegerBetween(h, 1, MAX_CARD_HEIGHT) &&
    isIntegerBetween(y, 0, Number.MAX_SAFE_INTEGER)
  )
}

function parseLayoutItem(item) {
  if (typeof item !== 'object' || item === null) return { error: INVALID_ID_ERROR }

  const { id, x, y, w, h } = item
  if (typeof id !== 'string' || !UUID_RE.test(id)) return { error: INVALID_ID_ERROR }
  if (!fitsGrid({ x, y, w, h })) return { error: INVALID_POSITION_ERROR }

  return { value: { id, x, y, w, h } }
}

export function parseLayoutItems(value) {
  if (!Array.isArray(value) || value.length > MAX_ANALYTICS_CARDS_PER_DASHBOARD) return { error: INVALID_ITEMS_ERROR }

  const items = []
  for (const item of value) {
    const parsed = parseLayoutItem(item)
    if (parsed.error) return parsed

    items.push(parsed.value)
  }

  return { value: items }
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function findFreeColumn(layouts, { y, w, h }) {
  for (let x = 0; x + w <= GRID_COLUMNS; x += 1) {
    if (!layouts.some(layout => overlaps(layout, { x, y, w, h }))) return x
  }

  return null
}

export function findFreeSlot(layouts, { w, h }) {
  const bottom = Math.max(0, ...layouts.map(layout => layout.y + layout.h))

  for (let y = 0; y < bottom; y += 1) {
    const x = findFreeColumn(layouts, { y, w, h })
    if (x !== null) return { x, y }
  }

  return { x: 0, y: bottom }
}
