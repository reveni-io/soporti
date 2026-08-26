import { describe, it, expect } from 'vitest'
import { progressAt, readingLineAt, tickOpacity, tickScale } from './rail-geometry.js'

describe('progressAt', () => {
  it('stays on the first message in an empty transcript', () => {
    expect(progressAt([], 0)).toBe(0)
  })

  it('stays on the first message while the reader is at the top', () => {
    expect(progressAt([0, 200, 400], 0)).toBe(0)
  })

  it('stays on the first message while the transcript starts below the reading line', () => {
    expect(progressAt([40, 240, 440], 0)).toBe(0)
  })

  it('reports a fractional position while the reading line crosses a message', () => {
    expect(progressAt([-50, 150, 350], 0)).toBeCloseTo(0.25)
    expect(progressAt([-100, 100, 300], 0)).toBeCloseTo(0.5)
    expect(progressAt([-150, 50, 250], 0)).toBeCloseTo(0.75)
  })

  it('lands exactly on a message when it reaches the reading line', () => {
    expect(progressAt([-200, 0, 200], 0)).toBe(1)
  })

  it('reaches a short last message that never rises above the viewport top', () => {
    expect(progressAt([-900, -100, 300], 400)).toBe(2)
  })

  it('reports the last message once everything above it is scrolled past', () => {
    expect(progressAt([-800, -600, -400], 0)).toBe(2)
  })

  it('reports the last message when the transcript has not been laid out yet', () => {
    expect(progressAt([0, 0, 0], 0)).toBe(2)
  })

  it('reports the only message of a single message transcript', () => {
    expect(progressAt([-40], 0)).toBe(0)
  })
})

describe('readingLineAt', () => {
  it('keeps the reading line at the viewport top before any scrolling', () => {
    expect(readingLineAt(0, 1200, 400)).toBe(0)
  })

  it('walks the reading line down to the viewport bottom at the end of the scroll', () => {
    expect(readingLineAt(800, 1200, 400)).toBe(400)
  })

  it('places the reading line halfway down the viewport at half the scroll', () => {
    expect(readingLineAt(400, 1200, 400)).toBe(200)
  })

  it('keeps the reading line at the top when there is nothing to scroll', () => {
    expect(readingLineAt(0, 400, 400)).toBe(0)
  })
})

describe('tickScale', () => {
  it('gives the active message a full-size tick', () => {
    expect(tickScale(0)).toBe(1)
  })

  it('shrinks each step away from the active message', () => {
    expect(tickScale(1)).toBe(0.68)
    expect(tickScale(2)).toBe(0.44)
    expect(tickScale(3)).toBe(0.25)
  })

  it('interpolates between steps so the tick glides as the reader scrolls', () => {
    expect(tickScale(0.5)).toBeCloseTo(0.84)
    expect(tickScale(1.5)).toBeCloseTo(0.56)
  })

  it('keeps far away messages at the smallest tick', () => {
    expect(tickScale(4)).toBe(0.25)
    expect(tickScale(12)).toBe(0.25)
  })
})

describe('tickOpacity', () => {
  it('leaves the active message fully lit', () => {
    expect(tickOpacity(0)).toBe(1)
  })

  it('dims each step away from the active message', () => {
    expect(tickOpacity(1)).toBe(0.6)
    expect(tickOpacity(0.5)).toBeCloseTo(0.8)
  })

  it('keeps far away messages at the faintest tick', () => {
    expect(tickOpacity(9)).toBe(0.35)
  })
})
