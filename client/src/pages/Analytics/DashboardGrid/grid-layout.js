export const GRID_COLUMNS = 12

const ROW_HEIGHT = 72
const GRID_GAP = 16
const ROW_STEP = ROW_HEIGHT + GRID_GAP
const MIN_WIDTH = 2
const MIN_HEIGHT = 2
const MAX_HEIGHT = 24

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function comparePosition(a, b) {
  if (a.y !== b.y) return a.y - b.y
  if (a.x !== b.x) return a.x - b.x

  return a.id < b.id ? -1 : 1
}

function bottomOf(item) {
  return item.y + item.h
}

function centerOf(item) {
  return item.y + item.h / 2
}

function overlapsColumns(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w
}

function collides(a, b) {
  return overlapsColumns(a, b) && a.y < bottomOf(b) && b.y < bottomOf(a)
}

function isSameItem(a, b) {
  return a.id === b.id && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function dropBelow(item, placed) {
  const blockers = placed.filter(other => collides(item, other))

  if (blockers.length === 0) return item

  return dropBelow({ ...item, y: Math.max(...blockers.map(bottomOf)) }, placed)
}

function slideUp(item, placed) {
  const ceilings = placed.filter(other => overlapsColumns(item, other) && bottomOf(other) <= item.y)
  const y = Math.max(0, ...ceilings.map(bottomOf))

  return y === item.y ? item : { ...item, y }
}

function settle(item, placed) {
  return slideUp(dropBelow(item, placed), placed)
}

function settleAll(items, placed = []) {
  return items.reduce((done, item) => [...done, settle(item, done)], placed)
}

function applyPositions(layout, placed) {
  const placedById = new Map(placed.map(item => [item.id, item]))
  const next = layout.map(item => {
    const candidate = placedById.get(item.id)
    return isSameItem(item, candidate) ? item : candidate
  })

  return next.every((item, index) => item === layout[index]) ? layout : next
}

function othersOf(layout, id) {
  return sortLayout(layout.filter(item => item.id !== id))
}

function wasStackedBelow(other, origin) {
  return overlapsColumns(other, origin) && other.y >= bottomOf(origin)
}

function letsPass(other, moved, origin) {
  if (wasStackedBelow(other, origin)) return bottomOf(moved) < centerOf(other)

  return moved.y <= centerOf(other)
}

function countLeading(others, moved, origin) {
  const index = others.findIndex(other => overlapsColumns(other, moved) && letsPass(other, moved, origin))

  return index === -1 ? others.length : index
}

function arrange(layout, pinned, leading) {
  const others = othersOf(layout, pinned.id)
  const above = settleAll(others.slice(0, leading))
  const anchored = dropBelow(pinned, above)
  const placed = settleAll(others.slice(leading), [...above, anchored])

  return applyPositions(layout, settleAll(sortLayout(placed)))
}

export function sortLayout(layout) {
  return [...layout].sort(comparePosition)
}

export function isSameLayout(a, b) {
  return a.length === b.length && a.every((item, index) => isSameItem(item, b[index]))
}

export function compactLayout(layout) {
  return applyPositions(layout, settleAll(sortLayout(layout)))
}

export function moveItem(layout, id, { x, y }) {
  const compacted = compactLayout(layout)
  const origin = compacted.find(item => item.id === id)

  if (!origin) return compacted

  const moved = { ...origin, x: clamp(x, 0, GRID_COLUMNS - origin.w), y: Math.max(0, y) }

  if (moved.x === origin.x && moved.y === origin.y) return compacted

  return arrange(compacted, moved, countLeading(othersOf(compacted, id), moved, origin))
}

export function resizeItem(layout, id, { w, h }) {
  const compacted = compactLayout(layout)
  const origin = compacted.find(item => item.id === id)

  if (!origin) return compacted

  const resized = { ...origin, w: clamp(w, MIN_WIDTH, GRID_COLUMNS - origin.x), h: clamp(h, MIN_HEIGHT, MAX_HEIGHT) }

  if (resized.w === origin.w && resized.h === origin.h) return compacted

  return arrange(compacted, resized, 0)
}

export function shiftItem(layout, id, { dx, dy }) {
  const compacted = compactLayout(layout)
  const origin = compacted.find(item => item.id === id)

  if (!origin) return compacted
  if (dy === 0) return moveItem(compacted, id, { x: origin.x + dx, y: origin.y })

  const reach = dy > 0 ? Math.max(...compacted.map(bottomOf)) - origin.y : origin.y

  for (let step = 1; step <= reach; step += 1) {
    const next = moveItem(compacted, id, { x: origin.x, y: origin.y + dy * step })
    if (next !== compacted) return next
  }

  return compacted
}

export function syncLayout(layout, items) {
  const incomingIds = new Set(items.map(item => item.id))
  const knownIds = new Set(layout.map(item => item.id))
  const kept = layout.filter(item => incomingIds.has(item.id))
  const added = items.filter(item => !knownIds.has(item.id))
  const isUnchanged = kept.length === layout.length && added.length === 0

  return compactLayout(isUnchanged ? layout : [...kept, ...added])
}

function columnStep(containerWidth) {
  return (containerWidth + GRID_GAP) / GRID_COLUMNS
}

export function itemRect(item, containerWidth) {
  const step = columnStep(containerWidth)
  const left = Math.round(item.x * step)
  const right = Math.round((item.x + item.w) * step - GRID_GAP)

  return { left, top: item.y * ROW_STEP, width: right - left, height: item.h * ROW_STEP - GRID_GAP }
}

export function layoutHeight(layout) {
  const rows = Math.max(0, ...layout.map(bottomOf))

  return rows === 0 ? 0 : rows * ROW_STEP - GRID_GAP
}

export function moveRect(item, { dx, dy }, containerWidth) {
  const origin = itemRect(item, containerWidth)

  return {
    ...origin,
    left: clamp(origin.left + dx, 0, containerWidth - origin.width),
    top: Math.max(0, origin.top + dy),
  }
}

export function resizeRect(item, { dx, dy }, containerWidth) {
  const origin = itemRect(item, containerWidth)
  const smallest = itemRect({ ...item, w: MIN_WIDTH, h: MIN_HEIGHT }, containerWidth)
  const largest = itemRect({ ...item, w: GRID_COLUMNS - item.x, h: MAX_HEIGHT }, containerWidth)

  return {
    ...origin,
    width: clamp(origin.width + dx, smallest.width, largest.width),
    height: clamp(origin.height + dy, smallest.height, largest.height),
  }
}

export function cellAt(rect, containerWidth) {
  return { x: Math.round(rect.left / columnStep(containerWidth)), y: Math.round(rect.top / ROW_STEP) }
}

export function spanAt(rect, containerWidth) {
  return {
    w: Math.round((rect.width + GRID_GAP) / columnStep(containerWidth)),
    h: Math.round((rect.height + GRID_GAP) / ROW_STEP),
  }
}
