import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAutoScroll } from './useAutoScroll.js'

function StreamingList({ lines, conversationKey = 0 }) {
  const { scrollRef, contentRef, pinToBottom, isFollowing } = useAutoScroll(conversationKey)

  return (
    <div>
      <div data-testid="viewport" ref={scrollRef}>
        <div data-testid="content" ref={contentRef}>
          {lines.map(line => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <p data-testid="following">{String(isFollowing)}</p>
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

  it('observes the content and the viewport and pins the viewport to the bottom when they resize', () => {
    render(<StreamingList lines={['first']} />)
    const tracker = trackScrolling(screen.getByTestId('viewport'), { scrollHeight: 1000, clientHeight: 300 })

    expect(observers).toHaveLength(1)
    expect(observers[0].observe.mock.calls).toEqual([[screen.getByTestId('content')], [screen.getByTestId('viewport')]])

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

  it('abandons a scheduled scroll when the user scrolls up before the frame runs', () => {
    render(<StreamingList lines={['first']} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    observers[0].callback([])
    tracker.scrollTop = 200
    tracker.writes = []
    fireEvent.scroll(viewport)
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
    const user = userEvent.setup()
    render(<StreamingList lines={['first']} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    tracker.scrollTop = 0
    fireEvent.scroll(viewport)
    await user.click(screen.getByRole('button', { name: /send/i }))
    flushFrames()

    expect(tracker.scrollTop).toBe(1000)
  })

  it('pins the viewport to the bottom again when another conversation is opened', () => {
    const { rerender } = render(<StreamingList lines={['first']} conversationKey={1} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    tracker.scrollTop = 0
    fireEvent.scroll(viewport)
    tracker.writes = []

    rerender(<StreamingList lines={['another conversation']} conversationKey={2} />)
    flushFrames()

    expect(tracker.scrollTop).toBe(1000)
  })

  it('reports that it is following the live edge before the user touches the scrollbar', () => {
    render(<StreamingList lines={['first']} />)

    expect(screen.getByTestId('following')).toHaveTextContent('true')
  })

  it('reports that it stopped following once the user scrolls up', () => {
    render(<StreamingList lines={['first']} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    tracker.scrollTop = 200
    fireEvent.scroll(viewport)

    expect(screen.getByTestId('following')).toHaveTextContent('false')
  })

  it('reports that it follows again once the user scrolls back close to the bottom', () => {
    render(<StreamingList lines={['first']} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    tracker.scrollTop = 200
    fireEvent.scroll(viewport)
    tracker.scrollTop = 660
    fireEvent.scroll(viewport)

    expect(screen.getByTestId('following')).toHaveTextContent('true')
  })

  it('reports that it follows again as soon as the reader is pinned back to the bottom', async () => {
    const user = userEvent.setup()
    render(<StreamingList lines={['first']} />)
    const viewport = screen.getByTestId('viewport')
    const tracker = trackScrolling(viewport, { scrollHeight: 1000, clientHeight: 300 })

    tracker.scrollTop = 0
    fireEvent.scroll(viewport)
    expect(screen.getByTestId('following')).toHaveTextContent('false')

    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(screen.getByTestId('following')).toHaveTextContent('true')
  })

  it('does not scroll after unmounting with a frame still pending', () => {
    const { unmount } = render(<StreamingList lines={['first']} />)
    const tracker = trackScrolling(screen.getByTestId('viewport'), { scrollHeight: 1000, clientHeight: 300 })

    observers[0].callback([])
    unmount()
    flushFrames()

    expect(tracker.writes).toEqual([])
  })
})
