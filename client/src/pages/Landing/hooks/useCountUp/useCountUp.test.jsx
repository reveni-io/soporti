import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useCountUp } from './useCountUp.js'

const TARGET = 1284
const DURATION_MS = 1000

function Counter() {
  const { ref, value } = useCountUp({ target: TARGET, durationMs: DURATION_MS })

  return (
    <span ref={ref} data-testid="value">
      {value}
    </span>
  )
}

function stubIntersectionObserver() {
  let trigger
  const disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback) {
        trigger = isIntersecting => callback([{ isIntersecting }])
      }
      observe() {}
      disconnect = disconnect
    }
  )
  return { setInView: isIntersecting => act(() => trigger(isIntersecting)), disconnect }
}

function stubAnimationFrames() {
  const frames = []
  vi.stubGlobal('requestAnimationFrame', callback => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(performance, 'now').mockReturnValue(0)
  return now => act(() => frames.splice(0).forEach(callback => callback(now)))
}

describe('useCountUp', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('counts from zero to the target once it scrolls into view', () => {
    const { setInView, disconnect } = stubIntersectionObserver()
    const runFrame = stubAnimationFrames()
    render(<Counter />)

    setInView(false)
    expect(screen.getByTestId('value')).toHaveTextContent('0')

    setInView(true)
    expect(disconnect).toHaveBeenCalled()

    runFrame(DURATION_MS / 2)
    const halfway = Number(screen.getByTestId('value').textContent)
    expect(halfway).toBeGreaterThan(TARGET / 2)
    expect(halfway).toBeLessThan(TARGET)

    runFrame(DURATION_MS)
    expect(screen.getByTestId('value')).toHaveTextContent(String(TARGET))
  })

  it('shows the target right away when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    stubIntersectionObserver()

    render(<Counter />)

    expect(screen.getByTestId('value')).toHaveTextContent(String(TARGET))
  })

  it('shows the target right away when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined)

    render(<Counter />)

    expect(screen.getByTestId('value')).toHaveTextContent(String(TARGET))
  })

  it('cancels a running count on unmount', () => {
    const { setInView } = stubIntersectionObserver()
    stubAnimationFrames()
    const { unmount } = render(<Counter />)
    setInView(true)

    unmount()

    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
