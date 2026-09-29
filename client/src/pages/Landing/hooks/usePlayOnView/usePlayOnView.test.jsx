import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { usePlayOnView } from './usePlayOnView.js'

const STEP_MS = 100

async function countToThree({ show, sleep, isCancelled }) {
  for (const value of ['one', 'two', 'three']) {
    if (isCancelled()) return
    show(value)
    await sleep(STEP_MS)
  }
}

function Player({ play = countToThree }) {
  const { ref, frame } = usePlayOnView({ play, initialFrame: 'idle', finalFrame: 'three', threshold: 0.3 })

  return <p ref={ref}>{frame}</p>
}

function stubIntersectionObserver() {
  const observer = { unobserve: vi.fn(), disconnect: vi.fn(), options: null, callback: null }
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback, options) {
        observer.callback = callback
        observer.options = options
      }
      observe() {}
      unobserve = observer.unobserve
      disconnect = observer.disconnect
    }
  )
  return observer
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('usePlayOnView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the final frame when there is no IntersectionObserver', () => {
    render(<Player />)

    expect(screen.getByText('three')).toBeInTheDocument()
  })

  it('shows the final frame when reduced motion is preferred', () => {
    stubIntersectionObserver()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    render(<Player />)

    expect(screen.getByText('three')).toBeInTheDocument()
  })

  it('stays on the initial frame until the element scrolls into view', async () => {
    const observer = stubIntersectionObserver()

    render(<Player />)
    act(() => observer.callback([{ isIntersecting: false }]))
    await advance(STEP_MS * 3)

    expect(screen.getByText('idle')).toBeInTheDocument()
    expect(observer.options).toEqual({ threshold: 0.3 })
  })

  it('plays the frames once the element is visible', async () => {
    const observer = stubIntersectionObserver()
    const { container } = render(<Player />)

    act(() => observer.callback([{ isIntersecting: true }]))

    expect(screen.getByText('one')).toBeInTheDocument()
    expect(observer.unobserve).toHaveBeenCalledTimes(1)
    expect(observer.unobserve).toHaveBeenCalledWith(container.firstChild)

    await advance(STEP_MS)
    expect(screen.getByText('two')).toBeInTheDocument()

    await advance(STEP_MS)
    expect(screen.getByText('three')).toBeInTheDocument()
  })

  it('starts playing only once', async () => {
    const observer = stubIntersectionObserver()
    const play = vi.fn(countToThree)
    render(<Player play={play} />)

    act(() => observer.callback([{ isIntersecting: true }]))
    act(() => observer.callback([{ isIntersecting: true }]))

    expect(play).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledWith({
      show: expect.any(Function),
      sleep: expect.any(Function),
      isCancelled: expect.any(Function),
    })
  })

  it('stops playing and disconnects when unmounted', async () => {
    const observer = stubIntersectionObserver()
    const { unmount } = render(<Player />)

    act(() => observer.callback([{ isIntersecting: true }]))
    unmount()
    await advance(STEP_MS * 3)

    expect(observer.disconnect).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
