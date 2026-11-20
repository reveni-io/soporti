import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import AppTile from './AppTile.jsx'

function notificationTitles(container) {
  return [...container.querySelectorAll('.lp-app-tile__title')].map(title => title.textContent)
}

describe('AppTile', () => {
  it('shows every notification on the lock screen when there is no IntersectionObserver', () => {
    render(<AppTile />)

    expect(screen.getByText('9:41')).toBeInTheDocument()
    expect(screen.getByText('Sales bot')).toBeInTheDocument()
    expect(screen.getByText('3 refunds over €500 since yesterday, all from the same merchant.')).toBeInTheDocument()
    expect(screen.getByText('Your answer is ready')).toBeInTheDocument()
    expect(screen.getByText(/order 4521 was refunded twice/i)).toBeInTheDocument()
    expect(screen.getByText('Your video is ready')).toBeInTheDocument()
  })

  it('lists the newest notification first and counts them all on the app icon in the dock', () => {
    const { container } = render(<AppTile />)

    expect(notificationTitles(container)).toEqual(['Your video is ready', 'Your answer is ready', 'Sales bot'])
    expect(screen.getByText('now')).toBeInTheDocument()
    expect(screen.getByText('2m')).toBeInTheDocument()
    expect(container.querySelector('.lp-app-tile__badge')).toHaveTextContent('3')
  })

  it('hides the demo from assistive technology', () => {
    const { container } = render(<AppTile />)

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  describe('animation (with IntersectionObserver)', () => {
    let observers

    class MockIntersectionObserver {
      constructor(callback) {
        this.callback = callback
        this.elements = []
        observers.push(this)
      }
      observe(element) {
        this.elements.push(element)
      }
      unobserve() {}
      disconnect() {}
    }

    function intersect() {
      act(() => {
        observers.forEach(observer =>
          observer.elements.forEach(element => observer.callback([{ isIntersecting: true, target: element }]))
        )
      })
    }

    async function advance(ms) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
      })
    }

    beforeEach(() => {
      observers = []
      vi.useFakeTimers()
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    })

    afterEach(() => {
      vi.clearAllTimers()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    it('shows every notification right away when motion is reduced', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true }))
      )

      const { container } = render(<AppTile />)

      expect(notificationTitles(container)).toEqual(['Your video is ready', 'Your answer is ready', 'Sales bot'])
      expect(container.querySelector('.lp-app-tile__badge')).toHaveTextContent('3')
    })

    it('waits on an empty lock screen until the tile scrolls into view', () => {
      const { container } = render(<AppTile />)

      expect(screen.getByText('9:41')).toBeInTheDocument()
      expect(notificationTitles(container)).toEqual([])
      expect(container.querySelector('.lp-app-tile__badge')).not.toBeInTheDocument()
    })

    it('delivers the notifications one by one, counts them on the app icon, then clears them and starts over', async () => {
      const { container } = render(<AppTile />)
      intersect()

      await advance(1200)
      expect(notificationTitles(container)).toEqual(['Sales bot'])
      expect(container.querySelector('.lp-app-tile__badge')).toHaveTextContent('1')

      await advance(2200)
      expect(notificationTitles(container)).toEqual(['Your answer is ready', 'Sales bot'])
      expect(screen.getByText('1m')).toBeInTheDocument()
      expect(container.querySelector('.lp-app-tile__badge')).toHaveTextContent('2')

      await advance(2200)
      expect(notificationTitles(container)).toEqual(['Your video is ready', 'Your answer is ready', 'Sales bot'])
      expect(container.querySelector('.lp-app-tile__badge')).toHaveTextContent('3')

      await advance(5200)
      expect(container.querySelector('.lp-app-tile__notifications--clearing')).toBeInTheDocument()
      expect(notificationTitles(container)).toHaveLength(3)

      await advance(600)
      expect(notificationTitles(container)).toEqual([])
      expect(container.querySelector('.lp-app-tile__badge')).not.toBeInTheDocument()
    })
  })
})
