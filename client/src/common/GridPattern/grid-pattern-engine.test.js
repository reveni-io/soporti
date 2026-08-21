import { describe, it, expect, vi } from 'vitest'
import { createWalker, drawGrid, drawGridHighlight, drawWalker, updateWalker } from './grid-pattern-engine.js'

const CELL = 120
const OFFSET_X = -24
const OFFSET_Y = -45

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
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }
}

function walkerAt(x, y, overrides = {}) {
  return { x, y, dir: { dx: 1, dy: 0 }, speed: 100, trail: [{ x, y }], ...overrides }
}

describe('createWalker', () => {
  it('places the walker on a grid intersection', () => {
    const walker = createWalker(1200, 800, [])

    expect((walker.x - OFFSET_X) % CELL).toBe(0)
    expect((walker.y - OFFSET_Y) % CELL).toBe(0)
  })

  it('gives it an axis-aligned direction, a speed and a trail seeded at its origin', () => {
    const walker = createWalker(1200, 800, [])

    expect(Math.abs(walker.dir.dx) + Math.abs(walker.dir.dy)).toBe(1)
    expect(walker.speed).toBeGreaterThanOrEqual(63)
    expect(walker.speed).toBeLessThanOrEqual(105)
    expect(walker.trail).toEqual([{ x: walker.x, y: walker.y }])
  })

  it('keeps its distance from an existing walker', () => {
    const existing = walkerAt(96, 75)

    const walker = createWalker(1200, 800, [existing])

    expect(Math.hypot(walker.x - existing.x, walker.y - existing.y)).toBeGreaterThan(0)
  })
})

describe('updateWalker', () => {
  it('advances along its direction', () => {
    const walker = walkerAt(OFFSET_X, OFFSET_Y, { speed: 120 })

    updateWalker(walker, 0.1, 1200, 800, [walker])

    expect(walker.x).toBe(OFFSET_X + 12)
    expect(walker.y).toBe(OFFSET_Y)
  })

  it('never stops moving, whatever the random roll is', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const walker = walkerAt(OFFSET_X, OFFSET_Y, { speed: 120 })

    const positions = []
    for (let frame = 0; frame < 40; frame++) {
      const before = `${walker.x},${walker.y}`
      updateWalker(walker, 0.05, 1200, 800, [walker])
      positions.push(before !== `${walker.x},${walker.y}`)
    }

    expect(positions.every(moved => moved)).toBe(true)
    vi.restoreAllMocks()
  })

  it('records a trail vertex only where it turns', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    const walker = walkerAt(OFFSET_X + CELL, OFFSET_Y + CELL, { speed: CELL })

    updateWalker(walker, 1, 1200, 800, [walker])

    expect(walker.dir.dx).toBe(1)
    expect(walker.trail).toEqual([{ x: OFFSET_X + CELL, y: OFFSET_Y + CELL }])

    Math.random.mockReturnValue(0.6)
    updateWalker(walker, 1, 1200, 800, [walker])

    expect(walker.dir.dy).toBe(1)
    expect(walker.trail).toEqual([
      { x: OFFSET_X + CELL, y: OFFSET_Y + CELL },
      { x: OFFSET_X + 3 * CELL, y: OFFSET_Y + CELL },
    ])
    vi.restoreAllMocks()
  })

  it('drops the vertices that fall behind the trail length', () => {
    const walker = walkerAt(1000, 0, {
      speed: 100,
      trail: [
        { x: 0, y: 0 },
        { x: 700, y: 0 },
        { x: 900, y: 0 },
      ],
    })

    updateWalker(walker, 0, 4000, 800, [walker])

    expect(walker.trail).toEqual([
      { x: 700, y: 0 },
      { x: 900, y: 0 },
    ])
  })

  it('turns at a grid stop instead of leaving the canvas', () => {
    const walker = walkerAt(OFFSET_X + CELL, OFFSET_Y, { dir: { dx: 1, dy: 0 }, speed: 2400 })

    updateWalker(walker, 1, CELL, CELL, [walker])

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
  it('draws the head as a single solid dot, with no halo and no pulse ring', () => {
    const ctx = fakeContext()

    drawWalker(ctx, walkerAt(96, 75), DARK)

    expect(ctx.arc).toHaveBeenCalledTimes(1)
    expect(ctx.arc).toHaveBeenCalledWith(96, 75, 5, 0, Math.PI * 2)
    expect(ctx.fillStyle).toBe('#F28536')
  })

  it('draws one gradient-stroked line per straight run of the trail', () => {
    const ctx = fakeContext()
    const walker = walkerAt(120, 60, {
      speed: 100,
      trail: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
      ],
    })

    drawWalker(ctx, walker, DARK)

    expect(ctx.createLinearGradient.mock.calls).toEqual([
      [120, 60, 120, 0],
      [120, 0, 0, 0],
    ])
    expect(ctx.moveTo.mock.calls).toEqual([
      [120, 60],
      [120, 0],
    ])
    expect(ctx.lineTo.mock.calls).toEqual([
      [120, 0],
      [0, 0],
    ])
    expect(ctx.lineCap).toBe('round')
  })

  it('fades the trail from the head down to zero at the trail length', () => {
    const ctx = fakeContext()
    const walker = walkerAt(0, 0, { speed: 100, trail: [{ x: -600, y: 0 }] })

    drawWalker(ctx, walker, DARK)

    expect(ctx.lineTo).toHaveBeenCalledWith(-240, 0)
    const gradient = ctx.createLinearGradient.mock.results[0].value
    expect(gradient.addColorStop.mock.calls).toEqual([
      [0, 'rgba(167, 181, 166, 0.8)'],
      [1, 'rgba(167, 181, 166, 0)'],
    ])
  })

  it('skips a vertex that sits on the head', () => {
    const ctx = fakeContext()
    const walker = walkerAt(50, 50, {
      speed: 100,
      trail: [
        { x: 50, y: 200 },
        { x: 50, y: 50 },
      ],
    })

    drawWalker(ctx, walker, DARK)

    expect(ctx.lineTo.mock.calls).toEqual([[50, 200]])
  })
})
