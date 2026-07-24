import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import GridPattern from './GridPattern.jsx'

function createFakeContext() {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    lineCap: 'butt',
    fillRectStyles: [],
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }
  ctx.fillRect = vi.fn(() => {
    ctx.fillRectStyles.push(ctx.fillStyle)
  })
  return ctx
}

describe('GridPattern', () => {
  let fakeCtx
  let canvasSize
  let rafQueue
  let rafId
  let nowMs
  let observers

  function runFrames(count, stepMs = 100) {
    for (let i = 0; i < count; i++) {
      const frame = rafQueue.shift()
      if (!frame) throw new Error('animation loop stopped scheduling frames')
      nowMs += stepMs
      frame(nowMs)
    }
  }

  function stubRandomSequence(values) {
    let i = 0
    vi.spyOn(Math, 'random').mockImplementation(() => values[i++ % values.length])
  }

  beforeEach(() => {
    fakeCtx = createFakeContext()
    canvasSize = { width: 800, height: 600 }
    rafQueue = []
    rafId = 0
    nowMs = 1000
    observers = []

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (type) {
      return type === '2d' ? fakeCtx : null
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => canvasSize.width,
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => canvasSize.height,
    })

    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(cb => {
        rafQueue.push(cb)
        return ++rafId
      })
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback
          this.observe = vi.fn()
          this.disconnect = vi.fn()
          observers.push(this)
        }
      }
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete HTMLCanvasElement.prototype.clientWidth
    delete HTMLCanvasElement.prototype.clientHeight
  })

  it('renders an aria-hidden canvas backdrop', () => {
    const { container } = render(<GridPattern />)
    const canvas = container.querySelector('canvas.grid-pattern')
    expect(canvas).toBeInTheDocument()
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not start the animation when the 2D context is unavailable', () => {
    HTMLCanvasElement.prototype.getContext.mockReturnValue(null)
    const { container } = render(<GridPattern />)
    expect(container.querySelector('canvas.grid-pattern')).toBeInTheDocument()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(observers).toHaveLength(0)
  })

  it('draws the grid and moves the walkers across many frames without throwing', () => {
    stubRandomSequence([0.42, 0.87, 0.6, 0.31, 0.74, 0.55, 0.9, 0.22, 0.68, 0.35])
    render(<GridPattern />)

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    runFrames(120)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(121)

    expect(fakeCtx.fillRectStyles).toContain('#042503')
    expect(fakeCtx.moveTo).toHaveBeenCalled()
    expect(fakeCtx.lineTo).toHaveBeenCalled()
    expect(fakeCtx.stroke).toHaveBeenCalled()
    const headPositions = new Set(
      fakeCtx.arc.mock.calls.filter(call => call[2] === 5).map(call => `${call[0]},${call[1]}`)
    )
    expect(headPositions.size).toBeGreaterThan(10)
    expect(fakeCtx.createRadialGradient).not.toHaveBeenCalled()
  })

  it('pauses walkers at intersections and draws the dwell pulse ring', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    render(<GridPattern />)
    runFrames(40)

    const pulseArc = fakeCtx.arc.mock.calls.find(call => call[2] >= 7 && call[2] < 10)
    expect(pulseArc).toBeDefined()
  })

  it('keeps crowded walkers moving via the farthest-option fallback', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    render(<GridPattern />)
    runFrames(60)

    const headPositions = new Set(
      fakeCtx.arc.mock.calls.filter(call => call[2] === 5).map(call => `${call[0]},${call[1]}`)
    )
    expect(headPositions.size).toBeGreaterThan(10)
  })

  it('lights up the grid around the cursor and eases the glow back out', () => {
    render(<GridPattern />)
    runFrames(2)
    expect(fakeCtx.createRadialGradient).not.toHaveBeenCalled()

    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    runFrames(1)
    expect(fakeCtx.createRadialGradient).toHaveBeenCalledWith(300, 200, 0, 300, 200, 220)
    const gradient = fakeCtx.createRadialGradient.mock.results[0].value
    expect(gradient.addColorStop).toHaveBeenCalledTimes(3)

    fireEvent.mouseMove(window, { clientX: 5000, clientY: 200 })
    runFrames(20)
    fakeCtx.createRadialGradient.mockClear()
    runFrames(5)
    expect(fakeCtx.createRadialGradient).not.toHaveBeenCalled()

    fireEvent.mouseMove(window, { clientX: 100, clientY: 100 })
    runFrames(1)
    expect(fakeCtx.createRadialGradient).toHaveBeenCalled()
    fireEvent.mouseLeave(document.documentElement)
    runFrames(20)
    fakeCtx.createRadialGradient.mockClear()
    runFrames(5)
    expect(fakeCtx.createRadialGradient).not.toHaveBeenCalled()
  })

  it('retiles the pixel buffer when the box or devicePixelRatio changes', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const { container } = render(<GridPattern />)
    const canvas = container.querySelector('canvas')

    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(1200)
    expect(fakeCtx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledWith(canvas)

    fakeCtx.setTransform.mockClear()
    fireEvent(window, new Event('resize'))
    expect(fakeCtx.setTransform).not.toHaveBeenCalled()

    canvasSize = { width: 1700, height: 900 }
    fireEvent(window, new Event('resize'))
    expect(canvas.width).toBe(3400)
    expect(canvas.height).toBe(1800)

    canvasSize = { width: 400, height: 300 }
    observers[0].callback([])
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
    runFrames(10)
  })

  it('renders a single static frame when the user prefers reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    )
    const addListener = vi.spyOn(window, 'addEventListener')
    const { unmount } = render(<GridPattern />)

    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(fakeCtx.fillRectStyles).toContain('#042503')
    expect(fakeCtx.arc).toHaveBeenCalled()
    const listenerTypes = addListener.mock.calls.map(call => call[0])
    expect(listenerTypes).toContain('resize')
    expect(listenerTypes).not.toContain('mousemove')

    unmount()
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).not.toHaveBeenCalled()
  })

  it('cancels the animation frame and removes listeners on unmount', () => {
    const { unmount } = render(<GridPattern />)
    runFrames(3)

    const removeWindowListener = vi.spyOn(window, 'removeEventListener')
    const removeDocListener = vi.spyOn(document.documentElement, 'removeEventListener')
    const lastRafId = rafId
    unmount()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(lastRafId)
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    const removedFromWindow = removeWindowListener.mock.calls.map(call => call[0])
    expect(removedFromWindow).toContain('resize')
    expect(removedFromWindow).toContain('mousemove')
    expect(removeDocListener.mock.calls.map(call => call[0])).toContain('mouseleave')
  })

  it('paints the light variant background color', () => {
    render(<GridPattern variant="light" />)
    runFrames(1)
    expect(fakeCtx.fillRectStyles).toContain('#faf4f0')
  })

  it('falls back to the dark palette for unknown variants', () => {
    render(<GridPattern variant="does-not-exist" />)
    runFrames(1)
    expect(fakeCtx.fillRectStyles).toContain('#042503')
  })
})
