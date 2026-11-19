import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAutoCycle } from './useAutoCycle.js'

const INTERVAL_MS = 1000

function Cycler() {
  const { ref, active, select, isPlaying, progressKey, hoverProps } = useAutoCycle({
    count: 3,
    intervalMs: INTERVAL_MS,
  })

  return (
    <div ref={ref} data-testid="cycler" {...hoverProps}>
      <span data-testid="active">{active}</span>
      <span data-testid="playing">{String(isPlaying)}</span>
      <span data-testid="progress">{String(progressKey)}</span>
      <button type="button" onClick={() => select(2)}>
        Third
      </button>
    </div>
  )
}

function stubIntersectionObserver() {
  let trigger
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback) {
        trigger = isIntersecting => callback([{ isIntersecting }])
      }
      observe() {}
      disconnect() {}
    }
  )
  return isIntersecting => act(() => trigger(isIntersecting))
}

async function advance(ms) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useAutoCycle', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits until it is in view, then advances and wraps around', async () => {
    vi.useFakeTimers()
    const setInView = stubIntersectionObserver()
    render(<Cycler />)

    await advance(INTERVAL_MS * 2)
    expect(screen.getByTestId('active')).toHaveTextContent('0')

    setInView(true)
    expect(screen.getByTestId('playing')).toHaveTextContent('true')

    await advance(INTERVAL_MS)
    expect(screen.getByTestId('active')).toHaveTextContent('1')
    await advance(INTERVAL_MS)
    await advance(INTERVAL_MS)
    expect(screen.getByTestId('active')).toHaveTextContent('0')
  })

  it('stops advancing once it scrolls out of view', async () => {
    vi.useFakeTimers()
    const setInView = stubIntersectionObserver()
    render(<Cycler />)

    setInView(true)
    setInView(false)
    await advance(INTERVAL_MS * 3)

    expect(screen.getByTestId('active')).toHaveTextContent('0')
    expect(screen.getByTestId('playing')).toHaveTextContent('false')
  })

  it('jumps to the picked item and restarts the countdown, even when the item is picked again', async () => {
    const setInView = stubIntersectionObserver()
    const user = userEvent.setup()
    render(<Cycler />)
    setInView(true)
    expect(screen.getByTestId('progress')).toHaveTextContent('0-0')

    await user.click(screen.getByRole('button', { name: 'Third' }))
    await user.unhover(screen.getByTestId('cycler'))
    expect(screen.getByTestId('active')).toHaveTextContent('2')
    expect(screen.getByTestId('progress')).toHaveTextContent('2-1')

    await user.click(screen.getByRole('button', { name: 'Third' }))
    await user.unhover(screen.getByTestId('cycler'))
    expect(screen.getByTestId('progress')).toHaveTextContent('2-2')
  })

  it('pauses while the pointer is over it', async () => {
    const setInView = stubIntersectionObserver()
    const user = userEvent.setup()
    render(<Cycler />)
    setInView(true)

    await user.hover(screen.getByTestId('cycler'))
    expect(screen.getByTestId('playing')).toHaveTextContent('false')
    expect(screen.getByTestId('progress')).toHaveTextContent('null')

    await user.unhover(screen.getByTestId('cycler'))
    expect(screen.getByTestId('playing')).toHaveTextContent('true')
  })

  it('never plays on its own when the user prefers reduced motion', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const observe = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe
        disconnect() {}
      }
    )
    render(<Cycler />)

    await advance(INTERVAL_MS * 3)

    expect(observe).not.toHaveBeenCalled()
    expect(screen.getByTestId('active')).toHaveTextContent('0')
  })

  it('stays put when IntersectionObserver is unavailable', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Cycler />)

    await advance(INTERVAL_MS * 3)

    expect(screen.getByTestId('active')).toHaveTextContent('0')
  })
})
