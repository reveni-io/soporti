import { describe, it, expect } from 'vitest'
import { findFreeSlot, parseLayoutItems } from './layout.js'

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const OTHER_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const POSITION_ERROR =
  'Every card position must fit the 12-column grid: x from 0 to 11, w from 1 to 12 with x + w at most 12, h from 1 to 24 and y at least 0.'

function item(overrides = {}) {
  return { id: CARD_ID, x: 0, y: 0, w: 6, h: 4, ...overrides }
}

describe('parseLayoutItems', () => {
  it('returns the positions without anything else the items carry', () => {
    const parsed = parseLayoutItems([item({ title: 'ignored' }), item({ id: OTHER_ID, x: 6, y: 2, w: 6, h: 24 })])

    expect(parsed).toEqual({
      value: [
        { id: CARD_ID, x: 0, y: 0, w: 6, h: 4 },
        { id: OTHER_ID, x: 6, y: 2, w: 6, h: 24 },
      ],
    })
  })

  it('accepts an empty list and a card that spans the whole grid', () => {
    expect(parseLayoutItems([])).toEqual({ value: [] })
    expect(parseLayoutItems([item({ x: 0, w: 12 })]).value).toHaveLength(1)
    expect(parseLayoutItems([item({ x: 11, w: 1 })]).value).toHaveLength(1)
  })

  it.each([
    { kind: 'missing items', value: undefined },
    { kind: 'items that are not a list', value: { id: CARD_ID } },
    { kind: 'more items than a user can have cards', value: Array.from({ length: 41 }, () => item()) },
  ])('rejects $kind', ({ value }) => {
    expect(parseLayoutItems(value)).toEqual({ error: 'Items must be a list of up to 40 card positions.' })
  })

  it.each([
    { kind: 'is not an object', value: 'card' },
    { kind: 'is null', value: null },
    { kind: 'has no id', value: item({ id: undefined }) },
    { kind: 'has an id that is not a UUID', value: item({ id: '42' }) },
  ])('rejects an item that $kind', ({ value }) => {
    expect(parseLayoutItems([item(), value])).toEqual({ error: 'Every card position needs a valid card ID.' })
  })

  it.each([
    { kind: 'a negative x', overrides: { x: -1 } },
    { kind: 'an x beyond the last column', overrides: { x: 12, w: 1 } },
    { kind: 'a width of zero', overrides: { w: 0 } },
    { kind: 'a width that leaves the grid', overrides: { x: 7, w: 6 } },
    { kind: 'a height of zero', overrides: { h: 0 } },
    { kind: 'a height above the maximum', overrides: { h: 25 } },
    { kind: 'a negative y', overrides: { y: -1 } },
    { kind: 'a fractional position', overrides: { y: 1.5 } },
    { kind: 'a position given as text', overrides: { x: '0' } },
    { kind: 'a missing height', overrides: { h: undefined } },
  ])('rejects $kind', ({ overrides }) => {
    expect(parseLayoutItems([item(overrides)])).toEqual({ error: POSITION_ERROR })
  })
})

describe('findFreeSlot', () => {
  const SIZE = { w: 6, h: 4 }

  it('puts the first card at the top left', () => {
    expect(findFreeSlot([], SIZE)).toEqual({ x: 0, y: 0 })
  })

  it('fills the gap beside the last card before starting a new row', () => {
    expect(findFreeSlot([{ x: 0, y: 0, w: 6, h: 4 }], SIZE)).toEqual({ x: 6, y: 0 })
  })

  it('starts a new row below when the last row is full', () => {
    const layouts = [
      { x: 0, y: 0, w: 6, h: 4 },
      { x: 6, y: 0, w: 6, h: 4 },
    ]

    expect(findFreeSlot(layouts, SIZE)).toEqual({ x: 0, y: 4 })
  })

  it('takes the first hole that is large enough, scanning rows top-down and columns left to right', () => {
    const layouts = [
      { x: 0, y: 0, w: 12, h: 2 },
      { x: 0, y: 2, w: 4, h: 4 },
      { x: 0, y: 6, w: 12, h: 3 },
    ]

    expect(findFreeSlot(layouts, SIZE)).toEqual({ x: 4, y: 2 })
    expect(findFreeSlot(layouts, { w: 9, h: 4 })).toEqual({ x: 0, y: 9 })
  })

  it('skips a gap that is too narrow or too short for the card', () => {
    const layouts = [
      { x: 0, y: 0, w: 8, h: 4 },
      { x: 8, y: 2, w: 4, h: 2 },
    ]

    expect(findFreeSlot(layouts, SIZE)).toEqual({ x: 0, y: 4 })
    expect(findFreeSlot(layouts, { w: 4, h: 2 })).toEqual({ x: 8, y: 0 })
  })

  it('never overlaps a card that hangs lower than its neighbours', () => {
    const layouts = [
      { x: 0, y: 0, w: 6, h: 8 },
      { x: 6, y: 0, w: 6, h: 4 },
    ]

    expect(findFreeSlot(layouts, SIZE)).toEqual({ x: 6, y: 4 })
    expect(findFreeSlot(layouts, { w: 12, h: 4 })).toEqual({ x: 0, y: 8 })
  })
})
