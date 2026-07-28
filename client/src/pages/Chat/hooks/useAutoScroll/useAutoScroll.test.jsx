import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAutoScroll } from './useAutoScroll.js'

function StreamingList({ lines }) {
  const { scrollRef, contentRef, pinToBottom } = useAutoScroll()

  return (
    <div>
      <div data-testid="viewport" ref={scrollRef}>
        <div data-testid="content" ref={contentRef}>
          {lines.map(line => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <button onClick={pinToBottom}>send</button>
    </div>
  )
}

function trackScrolling(element, { scrollHeight, clientHeight }) {
  const tracker = { scrollTop: 0, writes: [] }

  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => scrollHeight })
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => clientHeight })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => tracker.scrollTop,
    set: value => {
      tracker.scrollTop = value
      tracker.writes.push(value)
    },
  })

  return tracker
}

describe('useAutoScroll', () => {
  let observers
  let frames
  let nextFrameId

  function flushFrames() {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(frame => frame(0))
  }

  beforeEach(() => {
    observers = []
    frames = new Map()
    nextFrameId = 0

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
    vi.stubGlobal('requestAnimationFrame', callback => {
      nextFrameId += 1
      frames.set(nextFrameId, callback)
      return nextFrameId
    })
    vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes the content element and pins the viewport to the bottom when it grows', () => {
    render(<StreamingList lines={['first']} />)
    const tracker = trackScrolling(screen.getByTestId('viewport'), { scrollHeight: 1000, clientHeight: 300 })

    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledWith(screen.getByTestId('content'))

    observers[0].callback([])
    flushFrames()

    expect(tracker.scrollTop).toBe(1000)
  })

  it('coalesces a burst of growth into a single scroll per frame', () => {
    render(<StreamingList lines={['first']} />)
    const tracker = trackScrolling(screen.getByTestId('viewport'), { scrollHeight: 1000, clientHeight: 300 })

    observers[0].callback([])
    observers[0].callback([])
    observers[0].callback([])
    flushFrames()

    expect(tracker.writes).toEqual([1000])
  })

  it('stops following the content once the user scrolls up', () => {
    render(<StreamingList lines={['first']} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    tracker.scrollTop = 200
    tracker.writes = []
    fireEvent.scroll(viewport)

    observers[0].callback([])
    flushFrames()

    expect(tracker.scrollTop).toBe(200)
    expect(tracker.writes).toEqual([])
  })

  it('follows the content again once the user scrolls close to the bottom', () => {
    render(<StreamingList lines={['first']} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    tracker.scrollTop = 200
    fireEvent.scroll(viewport)
    tracker.scrollTop = 660
    fireEvent.scroll(viewport)
    tracker.writes = []

    observers[0].callback([])
    flushFrames()

    expect(tracker.scrollTop).toBe(1000)
  })

  it('jumps back to the bottom when a message is sent from a scrolled up position', async () => {
    render(<StreamingList lines={['first']} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    tracker.scrollTop = 0
    fireEvent.scroll(viewport)
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    flushFrames()

    expect(tracker.scrollTop).toBe(1000)
  })

  it('disconnects the observer and drops the pending frame on unmount', () => {
    const { unmount } = render(<StreamingList lines={['first']} />)
    trackScrolling(screen.getByTestId('viewport'), { scrollHeight: 1000, clientHeight: 300 })

    observers[0].callback([])
    expect(frames.size).toBe(1)

    unmount()

    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
  })
})
