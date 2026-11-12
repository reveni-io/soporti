import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useContainerWidth } from './useContainerWidth.js'

function Probe({ onRender }) {
  const { containerRef, width } = useContainerWidth()

  onRender(width)

  return <div ref={containerRef}>{`width: ${width}`}</div>
}

describe('useContainerWidth', () => {
  let observers

  beforeEach(() => {
    observers = []
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 900 })
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
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('has no width before the container is measured, then reports the measured one', () => {
    const onRender = vi.fn()

    render(<Probe onRender={onRender} />)

    expect(onRender.mock.calls[0]).toEqual([null])
    expect(screen.getByText('width: 900')).toBeInTheDocument()
  })

  it('falls back to a default width when the container measures nothing', () => {
    Element.prototype.getBoundingClientRect.mockReturnValue({ width: 0 })

    render(<Probe onRender={vi.fn()} />)

    expect(screen.getByText('width: 1200')).toBeInTheDocument()
  })

  it('follows the size the observer reports for the container', () => {
    render(<Probe onRender={vi.fn()} />)

    act(() => observers[0].callback([{ contentRect: { width: 640 } }]))

    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledTimes(1)
    expect(observers[0].observe).toHaveBeenCalledWith(screen.getByText('width: 640'))
  })

  it('falls back to the default width when the observer reports nothing', () => {
    render(<Probe onRender={vi.fn()} />)

    act(() => observers[0].callback([{ contentRect: { width: 0 } }]))

    expect(screen.getByText('width: 1200')).toBeInTheDocument()
  })

  it('stops observing once unmounted', () => {
    const { unmount } = render(<Probe onRender={vi.fn()} />)

    expect(observers[0].disconnect).not.toHaveBeenCalled()

    unmount()

    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
  })
})
