import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useReveal } from './useReveal.js'

function Revealed() {
  const ref = useReveal()
  return <div ref={ref} data-testid="target" />
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubIntersectionObserver() {
  const observe = vi.fn()
  const unobserve = vi.fn()
  const disconnect = vi.fn()
  let callback
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb, options) {
        callback = cb
        this.options = options
      }
      observe = observe
      unobserve = unobserve
      disconnect = disconnect
    }
  )
  return { observe, unobserve, disconnect, trigger: entries => callback(entries) }
}

describe('useReveal', () => {
  it('reveals the element as soon as it intersects and stops observing it', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    )
    const observer = stubIntersectionObserver()

    const { getByTestId } = render(<Revealed />)
    const target = getByTestId('target')

    expect(observer.observe).toHaveBeenCalledWith(target)
    expect(target).not.toHaveClass('is-visible')

    observer.trigger([{ isIntersecting: true, target }])

    expect(target).toHaveClass('is-visible')
    expect(observer.unobserve).toHaveBeenCalledWith(target)
  })

  it('leaves the element hidden while it has not intersected', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    )
    const observer = stubIntersectionObserver()

    const { getByTestId } = render(<Revealed />)
    const target = getByTestId('target')

    observer.trigger([{ isIntersecting: false, target }])

    expect(target).not.toHaveClass('is-visible')
  })

  it('reveals immediately when the user prefers reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    )
    const observer = stubIntersectionObserver()

    const { getByTestId } = render(<Revealed />)

    expect(getByTestId('target')).toHaveClass('is-visible')
    expect(observer.observe).not.toHaveBeenCalled()
  })

  it('reveals immediately when IntersectionObserver is unavailable', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    )
    vi.stubGlobal('IntersectionObserver', undefined)

    const { getByTestId } = render(<Revealed />)

    expect(getByTestId('target')).toHaveClass('is-visible')
  })

  it('disconnects the observer on unmount', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    )
    const observer = stubIntersectionObserver()

    const { unmount } = render(<Revealed />)
    unmount()

    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })
})
