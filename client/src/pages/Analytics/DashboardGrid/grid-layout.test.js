import { describe, it, expect } from 'vitest'
import {
  GRID_COLUMNS,
  cellAt,
  compactLayout,
  isSameLayout,
  itemRect,
  layoutHeight,
  moveItem,
  moveRect,
  resizeItem,
  resizeRect,
  shiftItem,
  sortLayout,
  spanAt,
  syncLayout,
} from './grid-layout.js'

const CONTAINER_WIDTH = 1184

function place(layout) {
  return Object.fromEntries(layout.map(item => [item.id, `${item.x},${item.y} ${item.w}x${item.h}`]))
}

function hasOverlap(layout) {
  return layout.some((a, index) => {
    return layout.slice(index + 1).some(b => {
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    })
  })
}

function createRandom(seed) {
  let state = seed

  return limit => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state % limit
  }
}

function randomLayout(random) {
  return Array.from({ length: 1 + random(8) }, (_, index) => {
    const w = 1 + random(8)
    return { id: `item-${index}`, x: random(GRID_COLUMNS + 1 - w), y: random(12), w, h: 1 + random(6) }
  })
}

function shuffle(layout, random) {
  return layout
    .map(item => ({ item, rank: random(1000) }))
    .sort((a, b) => a.rank - b.rank)
    .map(entry => entry.item)
}

describe('GRID_COLUMNS', () => {
  it('describes a twelve column grid', () => {
    expect(GRID_COLUMNS).toBe(12)
  })
})

describe('sortLayout', () => {
  it('orders the items by row, then column, then id without touching the input', () => {
    const layout = [
      { id: 'c', x: 6, y: 4, w: 6, h: 2 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      { id: 'z', x: 0, y: 0, w: 6, h: 4 },
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
    ]

    expect(sortLayout(layout).map(item => item.id)).toEqual(['a', 'z', 'b', 'c'])
    expect(layout.map(item => item.id)).toEqual(['c', 'b', 'z', 'a'])
  })
})

describe('isSameLayout', () => {
  it('accepts two layouts with the same ids and geometry in the same order', () => {
    const layout = [{ id: 'a', x: 0, y: 0, w: 6, h: 4 }]

    expect(isSameLayout(layout, [{ id: 'a', x: 0, y: 0, w: 6, h: 4, title: 'ignored' }])).toBe(true)
  })

  it('rejects a different length, order, id or geometry', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
    ]

    expect(isSameLayout(layout, [layout[0]])).toBe(false)
    expect(isSameLayout(layout, [layout[1], layout[0]])).toBe(false)
    expect(isSameLayout(layout, [layout[0], { ...layout[1], id: 'c' }])).toBe(false)
    expect(isSameLayout(layout, [layout[0], { ...layout[1], x: 5 }])).toBe(false)
    expect(isSameLayout(layout, [layout[0], { ...layout[1], y: 1 }])).toBe(false)
    expect(isSameLayout(layout, [layout[0], { ...layout[1], w: 5 }])).toBe(false)
    expect(isSameLayout(layout, [layout[0], { ...layout[1], h: 5 }])).toBe(false)
  })
})

describe('compactLayout', () => {
  it('lifts every item as far up as it can go', () => {
    const layout = [
      { id: 'a', x: 0, y: 3, w: 6, h: 4 },
      { id: 'b', x: 6, y: 1, w: 6, h: 2 },
      { id: 'c', x: 0, y: 20, w: 12, h: 2 },
    ]

    expect(place(compactLayout(layout))).toEqual({ a: '0,0 6x4', b: '6,0 6x2', c: '0,4 12x2' })
  })

  it('pushes an overlapping item below the one that comes first', () => {
    const layout = [
      { id: 'b', x: 3, y: 1, w: 6, h: 2 },
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
    ]

    expect(place(compactLayout(layout))).toEqual({ a: '0,0 6x4', b: '3,4 6x2' })
  })

  it('breaks a tie between two items on the same cell by id', () => {
    const layout = [
      { id: 'b', x: 0, y: 0, w: 6, h: 4 },
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
    ]

    expect(place(compactLayout(layout))).toEqual({ a: '0,0 6x4', b: '0,4 6x4' })
  })

  it('never lets an item jump over a blocker into a hole above it', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 2 },
      { id: 'b', x: 0, y: 2, w: 12, h: 2 },
      { id: 'c', x: 6, y: 4, w: 6, h: 2 },
    ]

    expect(compactLayout(layout)).toBe(layout)
  })

  it('returns the same reference when the layout is already compact', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
    ]

    expect(compactLayout(layout)).toBe(layout)
    expect(compactLayout([])).toEqual([])
  })

  it('keeps the array order, the untouched items and any extra field, and never mutates', () => {
    const layout = [
      { id: 'b', x: 0, y: 9, w: 6, h: 2, title: 'Second' },
      { id: 'a', x: 0, y: 0, w: 6, h: 4, title: 'First' },
    ]
    const snapshot = JSON.stringify(layout)
    const compacted = compactLayout(layout)

    expect(compacted).toEqual([
      { id: 'b', x: 0, y: 4, w: 6, h: 2, title: 'Second' },
      { id: 'a', x: 0, y: 0, w: 6, h: 4, title: 'First' },
    ])
    expect(compacted[1]).toBe(layout[1])
    expect(JSON.stringify(layout)).toBe(snapshot)
  })

  it('gives the same result whatever the array order', () => {
    const layout = [
      { id: 'a', x: 0, y: 2, w: 6, h: 4 },
      { id: 'b', x: 3, y: 2, w: 6, h: 2 },
      { id: 'c', x: 0, y: 1, w: 3, h: 1 },
    ]

    expect(place(compactLayout([layout[2], layout[0], layout[1]]))).toEqual(place(compactLayout(layout)))
  })
})

describe('moveItem', () => {
  const stack = [
    { id: 'a', x: 0, y: 0, w: 12, h: 4 },
    { id: 'b', x: 0, y: 4, w: 12, h: 4 },
    { id: 'c', x: 0, y: 8, w: 12, h: 4 },
  ]
  const pair = [
    { id: 'a', x: 0, y: 0, w: 6, h: 4 },
    { id: 'b', x: 6, y: 0, w: 6, h: 4 },
  ]

  it('moves an item into a free cell', () => {
    const layout = [{ id: 'a', x: 0, y: 0, w: 4, h: 2 }]

    expect(moveItem(layout, 'a', { x: 5, y: 0 })).toEqual([{ id: 'a', x: 5, y: 0, w: 4, h: 2 }])
  })

  it('lifts the moved item back up when nothing holds it down', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 4, h: 2 },
      { id: 'b', x: 4, y: 0, w: 4, h: 2 },
    ]

    expect(place(moveItem(layout, 'a', { x: 8, y: 9 }))).toEqual({ a: '8,0 4x2', b: '4,0 4x2' })
  })

  it('clamps the target to the twelve columns and to the first row', () => {
    const layout = [{ id: 'a', x: 3, y: 0, w: 4, h: 2 }]

    expect(place(moveItem(layout, 'a', { x: 30, y: -5 }))).toEqual({ a: '8,0 4x2' })
    expect(place(moveItem(layout, 'a', { x: -30, y: -5 }))).toEqual({ a: '0,0 4x2' })
  })

  it('returns the same reference when the item does not move', () => {
    expect(moveItem(pair, 'a', { x: 0, y: 0 })).toBe(pair)
    expect(moveItem(pair, 'a', { x: -3, y: -3 })).toBe(pair)
    expect(moveItem(pair, 'b', { x: 9, y: 0 })).toBe(pair)
  })

  it('returns the same reference when the move settles back where it started', () => {
    expect(moveItem(stack, 'a', { x: 0, y: 1 })).toBe(stack)
    expect(moveItem(stack, 'c', { x: 0, y: 40 })).toBe(stack)
  })

  it('returns the same reference for an unknown id', () => {
    expect(moveItem(pair, 'missing', { x: 3, y: 3 })).toBe(pair)
  })

  it('pushes down the neighbour it is dragged onto', () => {
    expect(place(moveItem(pair, 'a', { x: 3, y: 0 }))).toEqual({ a: '3,0 6x4', b: '6,4 6x4' })
    expect(place(moveItem(pair, 'b', { x: 2, y: 0 }))).toEqual({ a: '0,4 6x4', b: '2,0 6x4' })
  })

  it('leaves the columns it does not touch alone', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 4, h: 4 },
      { id: 'b', x: 4, y: 0, w: 4, h: 4 },
      { id: 'c', x: 8, y: 0, w: 4, h: 4 },
    ]

    expect(place(moveItem(layout, 'a', { x: 2, y: 0 }))).toEqual({ a: '2,0 4x4', b: '4,4 4x4', c: '8,0 4x4' })
  })

  it('lands below a neighbour once its top edge is past the middle of that neighbour', () => {
    expect(place(moveItem(pair, 'a', { x: 6, y: 2 }))).toEqual({ a: '6,0 6x4', b: '6,4 6x4' })
    expect(place(moveItem(pair, 'a', { x: 6, y: 3 }))).toEqual({ a: '6,4 6x4', b: '6,0 6x4' })
  })

  it('stays below the card above until its top edge reaches the middle of that card', () => {
    expect(moveItem(stack, 'b', { x: 0, y: 3 })).toBe(stack)
    expect(place(moveItem(stack, 'b', { x: 0, y: 2 }))).toEqual({ a: '0,4 12x4', b: '0,0 12x4', c: '0,8 12x4' })
  })

  it('stays above the card below until its bottom edge reaches the middle of that card', () => {
    expect(moveItem(stack, 'a', { x: 0, y: 1 })).toBe(stack)
    expect(place(moveItem(stack, 'a', { x: 0, y: 2 }))).toEqual({ a: '0,4 12x4', b: '0,0 12x4', c: '0,8 12x4' })
  })

  it('passes several cards in one move', () => {
    expect(place(moveItem(stack, 'a', { x: 0, y: 6 }))).toEqual({ a: '0,8 12x4', b: '0,0 12x4', c: '0,4 12x4' })
    expect(place(moveItem(stack, 'c', { x: 0, y: 0 }))).toEqual({ a: '0,4 12x4', b: '0,8 12x4', c: '0,0 12x4' })
  })

  it('slots a card between two others of a neighbouring column', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 2 },
      { id: 'c', x: 6, y: 2, w: 6, h: 4 },
    ]

    expect(place(moveItem(layout, 'a', { x: 6, y: 3 }))).toEqual({ a: '6,2 6x4', b: '6,0 6x2', c: '6,6 6x4' })
  })

  it('lets the cards below rise into the space the moved card leaves', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 0, y: 4, w: 6, h: 2 },
      { id: 'c', x: 6, y: 0, w: 6, h: 2 },
    ]

    expect(place(moveItem(layout, 'a', { x: 6, y: 2 }))).toEqual({ a: '6,2 6x4', b: '0,0 6x2', c: '6,0 6x2' })
  })

  it('compacts a layout that was not compact before moving', () => {
    const layout = [
      { id: 'a', x: 0, y: 5, w: 6, h: 4 },
      { id: 'b', x: 6, y: 9, w: 6, h: 4 },
    ]

    expect(place(moveItem(layout, 'a', { x: 0, y: 0 }))).toEqual({ a: '0,0 6x4', b: '6,0 6x4' })
    expect(place(moveItem(layout, 'a', { x: 1, y: 0 }))).toEqual({ a: '1,0 6x4', b: '6,4 6x4' })
  })

  it('keeps the array order and never mutates the input', () => {
    const snapshot = JSON.stringify(stack)
    const moved = moveItem(stack, 'c', { x: 0, y: 0 })

    expect(moved.map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(moved).not.toBe(stack)
    expect(JSON.stringify(stack)).toBe(snapshot)
  })

  it('gives the same result whatever the array order', () => {
    const shuffled = [stack[2], stack[0], stack[1]]

    expect(place(moveItem(shuffled, 'c', { x: 0, y: 5 }))).toEqual(place(moveItem(stack, 'c', { x: 0, y: 5 })))
  })
})

describe('resizeItem', () => {
  const pair = [
    { id: 'a', x: 0, y: 0, w: 6, h: 4 },
    { id: 'b', x: 6, y: 0, w: 6, h: 4 },
    { id: 'c', x: 0, y: 4, w: 6, h: 2 },
  ]

  it('grows an item and pushes down the cards it runs into', () => {
    expect(place(resizeItem(pair, 'a', { w: 8, h: 4 }))).toEqual({ a: '0,0 8x4', b: '6,4 6x4', c: '0,4 6x2' })
    expect(place(resizeItem(pair, 'a', { w: 6, h: 6 }))).toEqual({ a: '0,0 6x6', b: '6,0 6x4', c: '0,6 6x2' })
  })

  it('lets the cards below rise when an item shrinks', () => {
    expect(place(resizeItem(pair, 'a', { w: 6, h: 2 }))).toEqual({ a: '0,0 6x2', b: '6,0 6x4', c: '0,2 6x2' })
  })

  it('pushes down a taller neighbour that started higher instead of dropping the resized item', () => {
    const layout = [
      { id: 'top', x: 0, y: 0, w: 6, h: 2 },
      { id: 'a', x: 0, y: 2, w: 6, h: 4 },
      { id: 'tall', x: 6, y: 0, w: 6, h: 8 },
    ]

    expect(place(resizeItem(layout, 'a', { w: 8, h: 4 }))).toEqual({
      top: '0,0 6x2',
      a: '0,2 8x4',
      tall: '6,6 6x8',
    })
  })

  it('lifts the resized item when shrinking frees the space above it', () => {
    const layout = [
      { id: 'top', x: 6, y: 0, w: 6, h: 2 },
      { id: 'a', x: 0, y: 2, w: 12, h: 4 },
    ]

    expect(place(resizeItem(layout, 'a', { w: 6, h: 4 }))).toEqual({ top: '6,0 6x2', a: '0,0 6x4' })
  })

  it('never goes below two columns and two rows', () => {
    expect(place(resizeItem(pair, 'a', { w: 0, h: 0 }))).toEqual({ a: '0,0 2x2', b: '6,0 6x4', c: '0,2 6x2' })
  })

  it('stops at the right edge of the grid and at twenty four rows', () => {
    expect(place(resizeItem(pair, 'b', { w: 40, h: 40 }))).toEqual({ a: '0,0 6x4', b: '6,0 6x24', c: '0,4 6x2' })
    expect(place(resizeItem(pair, 'c', { w: 40, h: 2 }))).toEqual({ a: '0,0 6x4', b: '6,0 6x4', c: '0,4 12x2' })
  })

  it('returns the same reference when the size does not change', () => {
    const smallest = [{ id: 'a', x: 10, y: 0, w: 2, h: 2 }]

    expect(resizeItem(pair, 'a', { w: 6, h: 4 })).toBe(pair)
    expect(resizeItem(smallest, 'a', { w: 1, h: 1 })).toBe(smallest)
    expect(resizeItem(smallest, 'a', { w: 3, h: 2 })).toBe(smallest)
  })

  it('returns the same reference for an unknown id', () => {
    expect(resizeItem(pair, 'missing', { w: 3, h: 3 })).toBe(pair)
  })

  it('keeps the array order and never mutates the input', () => {
    const snapshot = JSON.stringify(pair)
    const resized = resizeItem(pair, 'a', { w: 12, h: 4 })

    expect(resized.map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(JSON.stringify(pair)).toBe(snapshot)
  })

  it('gives the same result whatever the array order', () => {
    const shuffled = [pair[2], pair[1], pair[0]]

    expect(place(resizeItem(shuffled, 'a', { w: 9, h: 5 }))).toEqual(place(resizeItem(pair, 'a', { w: 9, h: 5 })))
  })
})

describe('shiftItem', () => {
  const layout = [
    { id: 'a', x: 0, y: 0, w: 6, h: 4 },
    { id: 'b', x: 0, y: 4, w: 6, h: 2 },
    { id: 'c', x: 0, y: 6, w: 6, h: 4 },
  ]

  it('moves the item one column sideways', () => {
    expect(place(shiftItem(layout, 'a', { dx: 1, dy: 0 }))).toEqual({ a: '1,0 6x4', b: '0,4 6x2', c: '0,6 6x4' })
    expect(place(shiftItem(layout, 'a', { dx: 1, dy: 0 }))).toEqual(place(moveItem(layout, 'a', { x: 1, y: 0 })))
  })

  it('returns the same reference at the left and right edges', () => {
    const atRight = [{ id: 'a', x: 6, y: 0, w: 6, h: 4 }]

    expect(shiftItem(layout, 'a', { dx: -1, dy: 0 })).toBe(layout)
    expect(shiftItem(atRight, 'a', { dx: 1, dy: 0 })).toBe(atRight)
  })

  it('moves the item down past the next card', () => {
    expect(place(shiftItem(layout, 'a', { dx: 0, dy: 1 }))).toEqual({ a: '0,2 6x4', b: '0,0 6x2', c: '0,6 6x4' })
  })

  it('moves the item up past the previous card', () => {
    expect(place(shiftItem(layout, 'c', { dx: 0, dy: -1 }))).toEqual({ a: '0,0 6x4', b: '0,8 6x2', c: '0,4 6x4' })
  })

  it('returns the same reference at the top and at the bottom', () => {
    expect(shiftItem(layout, 'a', { dx: 0, dy: -1 })).toBe(layout)
    expect(shiftItem(layout, 'c', { dx: 0, dy: 1 })).toBe(layout)
  })

  it('returns the same reference for an unknown id', () => {
    expect(shiftItem(layout, 'missing', { dx: 1, dy: 0 })).toBe(layout)
  })
})

describe('syncLayout', () => {
  const layout = [
    { id: 'a', x: 6, y: 0, w: 6, h: 4 },
    { id: 'b', x: 0, y: 0, w: 6, h: 2 },
  ]

  it('keeps the local position of the cards that are still there', () => {
    const items = [
      { id: 'a', x: 0, y: 0, w: 3, h: 3 },
      { id: 'b', x: 3, y: 0, w: 3, h: 3 },
    ]

    expect(syncLayout(layout, items)).toBe(layout)
  })

  it('appends the new cards where the server placed them', () => {
    const items = [...layout, { id: 'c', x: 0, y: 2, w: 6, h: 4 }]

    expect(syncLayout(layout, items)).toEqual([...layout, { id: 'c', x: 0, y: 2, w: 6, h: 4 }])
  })

  it('compacts a new card that lands on an occupied or floating cell', () => {
    const occupied = [...layout, { id: 'c', x: 6, y: 2, w: 6, h: 4 }]
    const floating = [...layout, { id: 'c', x: 0, y: 30, w: 6, h: 4 }]

    expect(place(syncLayout(layout, occupied))).toEqual({ a: '6,0 6x4', b: '0,0 6x2', c: '6,4 6x4' })
    expect(place(syncLayout(layout, floating))).toEqual({ a: '6,0 6x4', b: '0,0 6x2', c: '0,2 6x4' })
  })

  it('drops the cards that are gone and closes the gap they leave', () => {
    const stacked = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 0, y: 4, w: 6, h: 2 },
    ]

    expect(syncLayout(stacked, [{ id: 'b', x: 9, y: 9, w: 1, h: 1 }])).toEqual([{ id: 'b', x: 0, y: 0, w: 6, h: 2 }])
    expect(syncLayout(stacked, [])).toEqual([])
  })

  it('builds the first layout from the server cards', () => {
    const items = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
    ]

    expect(syncLayout([], items)).toEqual(items)
  })

  it('returns the same reference when nothing changed', () => {
    const empty = []

    expect(syncLayout(layout, [layout[1], layout[0]])).toBe(layout)
    expect(syncLayout(empty, [])).toBe(empty)
  })

  it('never mutates its inputs', () => {
    const items = [{ id: 'c', x: 0, y: 0, w: 6, h: 4 }]
    const snapshot = JSON.stringify([layout, items])

    syncLayout(layout, items)

    expect(JSON.stringify([layout, items])).toBe(snapshot)
  })
})

describe('itemRect', () => {
  it('turns grid units into pixels with a gap between the cells and no outer margin', () => {
    expect(itemRect({ id: 'a', x: 0, y: 0, w: 6, h: 4 }, CONTAINER_WIDTH)).toEqual({
      left: 0,
      top: 0,
      width: 584,
      height: 336,
    })
    expect(itemRect({ id: 'b', x: 6, y: 4, w: 6, h: 2 }, CONTAINER_WIDTH)).toEqual({
      left: 600,
      top: 352,
      width: 584,
      height: 160,
    })
  })

  it('rounds to whole pixels and still fills the container exactly', () => {
    const left = itemRect({ id: 'a', x: 0, y: 0, w: 5, h: 1 }, 1000)
    const right = itemRect({ id: 'b', x: 5, y: 0, w: 7, h: 1 }, 1000)

    expect(left).toEqual({ left: 0, top: 0, width: 407, height: 72 })
    expect(right).toEqual({ left: 423, top: 0, width: 577, height: 72 })
    expect(right.left - (left.left + left.width)).toBe(16)
    expect(right.left + right.width).toBe(1000)
  })
})

describe('layoutHeight', () => {
  it('is zero for an empty layout', () => {
    expect(layoutHeight([])).toBe(0)
  })

  it('reaches the bottom of the lowest item', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 6 },
    ]

    expect(layoutHeight(layout)).toBe(512)
  })
})

describe('moveRect', () => {
  const item = { id: 'a', x: 2, y: 1, w: 4, h: 2 }

  it('follows the pointer pixel by pixel', () => {
    expect(moveRect(item, { dx: 37, dy: -11 }, CONTAINER_WIDTH)).toEqual({
      left: 237,
      top: 77,
      width: 384,
      height: 160,
    })
  })

  it('stays inside the container sideways and below its top edge', () => {
    expect(moveRect(item, { dx: -900, dy: -900 }, CONTAINER_WIDTH)).toMatchObject({ left: 0, top: 0 })
    expect(moveRect(item, { dx: 5000, dy: 5000 }, CONTAINER_WIDTH)).toMatchObject({ left: 800, top: 5088 })
  })
})

describe('resizeRect', () => {
  const item = { id: 'a', x: 2, y: 1, w: 4, h: 2 }

  it('follows the pointer pixel by pixel from the bottom right corner', () => {
    expect(resizeRect(item, { dx: 41, dy: 23 }, CONTAINER_WIDTH)).toEqual({
      left: 200,
      top: 88,
      width: 425,
      height: 183,
    })
  })

  it('never gets smaller than two columns by two rows', () => {
    expect(resizeRect(item, { dx: -900, dy: -900 }, CONTAINER_WIDTH)).toMatchObject({ width: 184, height: 160 })
  })

  it('never crosses the right edge nor grows past twenty four rows', () => {
    expect(resizeRect(item, { dx: 5000, dy: 5000 }, CONTAINER_WIDTH)).toMatchObject({ width: 984, height: 2096 })
  })
})

describe('cellAt', () => {
  it('snaps a pixel position to the nearest cell', () => {
    expect(cellAt({ left: 249, top: 43 }, CONTAINER_WIDTH)).toEqual({ x: 2, y: 0 })
    expect(cellAt({ left: 250, top: 44 }, CONTAINER_WIDTH)).toEqual({ x: 3, y: 1 })
  })
})

describe('spanAt', () => {
  it('snaps a pixel size to the nearest number of cells', () => {
    expect(spanAt({ width: 384, height: 160 }, CONTAINER_WIDTH)).toEqual({ w: 4, h: 2 })
    expect(spanAt({ width: 433, height: 203 }, CONTAINER_WIDTH)).toEqual({ w: 4, h: 2 })
    expect(spanAt({ width: 434, height: 204 }, CONTAINER_WIDTH)).toEqual({ w: 5, h: 3 })
  })
})

describe('layout invariants', () => {
  it('always returns a compact layout without overlaps, inside the columns, whatever the input order', () => {
    const random = createRandom(20261112)

    for (let round = 0; round < 300; round += 1) {
      const layout = compactLayout(randomLayout(random))
      const id = `item-${random(layout.length)}`
      const target = { x: random(14) - 1, y: random(30) - 2 }
      const size = { w: random(15), h: random(28) }
      const results = [moveItem(layout, id, target), resizeItem(layout, id, size)]
      const shuffled = shuffle(layout, random)

      results.forEach(result => {
        expect(hasOverlap(result)).toBe(false)
        expect(compactLayout(result)).toBe(result)
        expect(result.map(item => item.id)).toEqual(layout.map(item => item.id))
        expect(result.every(item => item.x >= 0 && item.x + item.w <= GRID_COLUMNS && item.y >= 0)).toBe(true)
        expect(result === layout || !isSameLayout(result, layout)).toBe(true)
      })
      expect(place(moveItem(shuffled, id, target))).toEqual(place(results[0]))
      expect(place(resizeItem(shuffled, id, size))).toEqual(place(results[1]))
    }
  })
})
