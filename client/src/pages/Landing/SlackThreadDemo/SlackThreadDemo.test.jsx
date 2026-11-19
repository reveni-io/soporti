import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import SlackThreadDemo from './SlackThreadDemo.jsx'

describe('SlackThreadDemo', () => {
  it('shows the finished thread when there is no IntersectionObserver', () => {
    const { container } = render(<SlackThreadDemo />)

    expect(screen.getByText('#support')).toBeInTheDocument()
    expect(screen.getByText(/why are refunds failing for acme/i)).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-slack-demo__step--done')).toHaveLength(3)
    expect(screen.getByText(/partial refunds reach the payment provider without a currency/)).toBeInTheDocument()
    expect(screen.getByText(/212 events of the same error/)).toBeInTheDocument()
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

    it('adds each source as a step and then writes the answer into the same reply', async () => {
      const { container } = render(<SlackThreadDemo />)
      intersect()

      expect(screen.queryByText('Searching logs')).not.toBeInTheDocument()

      await advance(1400)
      expect(screen.getByText('Searching logs').closest('li')).toHaveClass('lp-slack-demo__step--running')

      await advance(1100)
      expect(screen.getByText('Searching logs').closest('li')).toHaveClass('lp-slack-demo__step--done')
      expect(screen.getByText('Reading file')).toBeInTheDocument()

      await advance(1100 * 2)
      expect(container.querySelectorAll('.lp-slack-demo__step--done')).toHaveLength(3)
      expect(screen.getByText(/without a currency/)).toBeInTheDocument()
      expect(screen.queryByText(/212 events/)).not.toBeInTheDocument()

      await advance(1000)
      expect(screen.getByText(/212 events/)).toBeInTheDocument()

      await advance(4600)
      expect(screen.queryByText('Searching logs')).not.toBeInTheDocument()
    })
  })
})
