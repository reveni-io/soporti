import { describe, it, expect, vi } from 'vitest'
import { createWalker, drawGrid, drawGridHighlight, drawWalker, updateWalker } from './grid-pattern-engine.js'

const CELL = 120
const OFFSET_X = -24
const OFFSET_Y = -45
const TRAIL_LIFE_MS = 2400

const DARK = {
  bg: '#042503',
  line: '#556654',
  lineAlpha: 0.8,
  dotAlpha: 0.4,
  trail: '167, 181, 166',
  trailMax: 0.8,
  hoverMax: 0.9,
}

function fakeContext() {
  return {
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }
}

function walkerAt(x, y, overrides = {}) {
  return { x, y, dir: { dx: 1, dy: 0 }, speed: 120, trail: [], dwellUntil: 0, dwellStart: 0, ...overrides }
}

describe('createWalker', () => {
  it('places the walker on a grid intersection', () => {
    const walker = createWalker(1200, 800, [])

    expect((walker.x - OFFSET_X) % CELL).toBe(0)
    expect((walker.y - OFFSET_Y) % CELL).toBe(0)
  })

  it('gives it an axis-aligned direction, a speed and an empty trail', () => {
    const walker = createWalker(1200, 800, [])

    expect(Math.abs(walker.dir.dx) + Math.abs(walker.dir.dy)).toBe(1)
    expect(walker.speed).toBeGreaterThanOrEqual(90)
    expect(walker.speed).toBeLessThanOrEqual(150)
    expect(walker.trail).toEqual([])
  })

  it('keeps its distance from an existing walker', () => {
    const existing = walkerAt(96, 75)

    const walker = createWalker(1200, 800, [existing])

    expect(Math.hypot(walker.x - existing.x, walker.y - existing.y)).toBeGreaterThan(0)
  })
})

describe('updateWalker', () => {
  it('advances along its direction and records the trail', () => {
    const walker = walkerAt(OFFSET_X, OFFSET_Y)

    updateWalker(walker, 0.1, 1000, 1200, 800, [walker])

    expect(walker.x).toBe(OFFSET_X + 12)
    expect(walker.trail).toEqual([{ x: OFFSET_X, y: OFFSET_Y, t: 1000 }])
  })

  it('drops trail points older than the trail lifetime', () => {
    const now = 10_000
    const walker = walkerAt(OFFSET_X, OFFSET_Y, {
      trail: [
        { x: 0, y: 0, t: now - TRAIL_LIFE_MS - 1 },
        { x: 1, y: 1, t: now - 100 },
      ],
    })

    updateWalker(walker, 0.1, now, 1200, 800, [walker])

    expect(walker.trail.map(point => point.t)).toEqual([now - 100, now])
  })

  it('stays put while it is dwelling', () => {
    const walker = walkerAt(OFFSET_X, OFFSET_Y, { dwellUntil: 5000 })

    updateWalker(walker, 0.1, 1000, 1200, 800, [walker])

    expect(walker.x).toBe(OFFSET_X)
  })

  it('turns at a grid stop instead of leaving the canvas', () => {
    const walker = walkerAt(OFFSET_X + CELL, OFFSET_Y, { dir: { dx: 1, dy: 0 }, speed: 2400 })

    updateWalker(walker, 1, 1000, CELL, CELL, [walker])

    expect(Number.isFinite(walker.x)).toBe(true)
    expect(Math.abs(walker.dir.dx) + Math.abs(walker.dir.dy)).toBe(1)
  })
})

describe('drawGrid', () => {
  it('paints the background, the lines and the dots', () => {
    const ctx = fakeContext()

    drawGrid(ctx, 240, 240, DARK)

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 240, 240)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
    expect(ctx.arc).toHaveBeenCalled()
    expect(ctx.globalAlpha).toBe(1)
  })
})

describe('drawGridHighlight', () => {
  it('paints a radial gradient around the pointer', () => {
    const ctx = fakeContext()

    drawGridHighlight(ctx, { x: 100, y: 100, intensity: 1 }, DARK)

    expect(ctx.createRadialGradient).toHaveBeenCalledWith(100, 100, 0, 100, 100, 220)
    expect(ctx.stroke).toHaveBeenCalled()
  })
})

describe('drawWalker', () => {
  it('draws the head of the walker', () => {
    const ctx = fakeContext()

    drawWalker(ctx, walkerAt(96, 75), 1000, DARK)

    expect(ctx.arc).toHaveBeenCalled()
    expect(ctx.fill).toHaveBeenCalled()
  })

  it('draws a trail segment per recorded point', () => {
    const ctx = fakeContext()
    const walker = walkerAt(96, 75, {
      trail: [
        { x: 0, y: 0, t: 900 },
        { x: 10, y: 0, t: 950 },
      ],
    })

    drawWalker(ctx, walker, 1000, DARK)

    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 0)
  })

  it('skips trail segments that have already faded out', () => {
    const ctx = fakeContext()
    const walker = walkerAt(96, 75, {
      trail: [
        { x: 0, y: 0, t: 0 },
        { x: 10, y: 0, t: 1 },
      ],
    })

    drawWalker(ctx, walker, 10_000, DARK)

    expect(ctx.lineTo).not.toHaveBeenCalled()
  })

  it('draws the dwell pulse while dwelling', () => {
    const ctx = fakeContext()
    const walker = walkerAt(96, 75, { dwellUntil: 2000, dwellStart: 1000 })

    drawWalker(ctx, walker, 1500, DARK)

    expect(ctx.stroke).toHaveBeenCalled()
  })
})
