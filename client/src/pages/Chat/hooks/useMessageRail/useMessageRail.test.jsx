import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { useMessageRail } from './useMessageRail.js'

function Transcript({ messages }) {
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const { items, progress, activeIndex, isOverflowing, scrollToMessage } = useMessageRail(
    scrollRef,
    contentRef,
    messages
  )

  return (
    <div>
      <div data-testid="viewport" ref={scrollRef}>
        <div data-testid="content" ref={contentRef}>
          {messages.map((message, index) => (
            <div key={index} data-testid={`message-${index}`} data-message-index={index} />
          ))}
        </div>
      </div>
      <p data-testid="progress">{progress.toFixed(2)}</p>
      <p data-testid="active">{activeIndex}</p>
      <p data-testid="overflowing">{String(isOverflowing)}</p>
      {items.map(item => (
        <button key={item.index} onClick={() => scrollToMessage(item.index)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

function sizeViewport({ scrollHeight, clientHeight, scrollTop = 0 }) {
  const viewport = screen.getByTestId('viewport')

  Object.defineProperty(viewport, 'scrollHeight', { configurable: true, get: () => scrollHeight })
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, get: () => clientHeight })
  Object.defineProperty(viewport, 'scrollTop', { configurable: true, get: () => scrollTop })
  viewport.getBoundingClientRect = () => ({ top: 0 })
}

function placeMessages(tops) {
  tops.forEach((top, index) => {
    screen.getByTestId(`message-${index}`).getBoundingClientRect = () => ({ top })
  })
}

const CONVERSATION = [
  { role: 'user', content: 'How do refunds work?' },
  { role: 'assistant', parts: [{ type: 'text', content: 'Within 14 days.' }] },
  { role: 'user', content: 'And exchanges?' },
]

describe('useMessageRail', () => {
  let resizeObservers

  beforeEach(() => {
    resizeObservers = []

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback
          this.observe = vi.fn()
          this.disconnect = vi.fn()
          resizeObservers.push(this)
        }
      }
    )
    vi.stubGlobal('requestAnimationFrame', callback => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal(
      'matchMedia',
      vi.fn(query => ({ matches: false, media: query }))
    )
    Element.prototype.scrollIntoView.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('derives a labelled rail item per message', () => {
    render(<Transcript messages={CONVERSATION} />)

    expect(screen.getByRole('button', { name: 'Question 1: How do refunds work?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Answer 2: Within 14 days.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 3: And exchanges?' })).toBeInTheDocument()
  })

  it('observes the viewport and the transcript so the rail follows their size', () => {
    render(<Transcript messages={CONVERSATION} />)

    expect(resizeObservers).toHaveLength(1)
    expect(resizeObservers[0].observe.mock.calls).toEqual([
      [screen.getByTestId('viewport')],
      [screen.getByTestId('content')],
    ])
  })

  it('reports the transcript as overflowing only once it is taller than the viewport', () => {
    render(<Transcript messages={CONVERSATION} />)
    expect(screen.getByTestId('overflowing')).toHaveTextContent('false')

    sizeViewport({ scrollHeight: 1200, clientHeight: 400 })
    act(() => resizeObservers[0].callback([]))

    expect(screen.getByTestId('overflowing')).toHaveTextContent('true')
  })

  it('keeps a barely scrollable transcript from showing the rail', () => {
    render(<Transcript messages={CONVERSATION} />)

    sizeViewport({ scrollHeight: 500, clientHeight: 400 })
    act(() => resizeObservers[0].callback([]))

    expect(screen.getByTestId('overflowing')).toHaveTextContent('false')
  })

  it('advances the progress fractionally while the reader scrolls through a single message', () => {
    render(<Transcript messages={CONVERSATION} />)
    sizeViewport({ scrollHeight: 1200, clientHeight: 400 })

    placeMessages([-100, 300, 700])
    act(() => fireEvent.scroll(screen.getByTestId('viewport')))

    expect(screen.getByTestId('progress')).toHaveTextContent('0.25')
    expect(screen.getByTestId('active')).toHaveTextContent('0')
  })

  it('rounds the progress to the message the reader is closest to', () => {
    render(<Transcript messages={CONVERSATION} />)
    sizeViewport({ scrollHeight: 1200, clientHeight: 400 })

    placeMessages([-300, 100, 500])
    act(() => fireEvent.scroll(screen.getByTestId('viewport')))

    expect(screen.getByTestId('progress')).toHaveTextContent('0.75')
    expect(screen.getByTestId('active')).toHaveTextContent('1')
  })

  it('settles on the last message once the transcript is scrolled to the end', () => {
    render(<Transcript messages={CONVERSATION} />)
    sizeViewport({ scrollHeight: 1200, clientHeight: 400 })

    placeMessages([-800, -400, -100])
    act(() => fireEvent.scroll(screen.getByTestId('viewport')))

    expect(screen.getByTestId('progress')).toHaveTextContent('2.00')
    expect(screen.getByTestId('active')).toHaveTextContent('2')
  })

  it('reaches the last message when a short one sits at the end of a fully scrolled transcript', () => {
    render(<Transcript messages={CONVERSATION} />)
    sizeViewport({ scrollHeight: 1200, clientHeight: 400, scrollTop: 800 })

    placeMessages([-900, -100, 300])
    act(() => fireEvent.scroll(screen.getByTestId('viewport')))

    expect(screen.getByTestId('progress')).toHaveTextContent('2.00')
    expect(screen.getByTestId('active')).toHaveTextContent('2')
  })

  it('coalesces a burst of scroll events into a single measurement per frame', () => {
    const requestFrame = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    render(<Transcript messages={CONVERSATION} />)

    const viewport = screen.getByTestId('viewport')
    fireEvent.scroll(viewport)
    fireEvent.scroll(viewport)
    fireEvent.scroll(viewport)

    expect(requestFrame).toHaveBeenCalledTimes(3)
    expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(3)
  })

  it('stops measuring after unmounting', () => {
    const { unmount } = render(<Transcript messages={CONVERSATION} />)

    unmount()

    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('scrolls an earlier message to the top of the viewport', async () => {
    const user = userEvent.setup()
    render(<Transcript messages={CONVERSATION} />)

    await user.click(screen.getByRole('button', { name: 'Answer 2: Within 14 days.' }))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('scrolls the last message to the live edge instead of its top', async () => {
    const user = userEvent.setup()
    render(<Transcript messages={CONVERSATION} />)

    await user.click(screen.getByRole('button', { name: 'Question 3: And exchanges?' }))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' })
  })

  it('scrolls without animation when the reader asked for reduced motion', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(query => ({ matches: true, media: query }))
    )
    render(<Transcript messages={CONVERSATION} />)

    await user.click(screen.getByRole('button', { name: 'Answer 2: Within 14 days.' }))

    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })
})
