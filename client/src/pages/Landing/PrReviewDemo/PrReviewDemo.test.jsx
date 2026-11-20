import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import PrReviewDemo from './PrReviewDemo.jsx'

describe('PrReviewDemo', () => {
  it('shows the verified review when there is no IntersectionObserver', () => {
    const { container } = render(<PrReviewDemo />)

    expect(screen.getByText('Fix refund rounding for partial returns')).toBeInTheDocument()
    expect(screen.getByText('Review posted')).toBeInTheDocument()
    expect(screen.getByText('✓ Verified')).toBeInTheDocument()
    expect(screen.getByText('Major')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-pr-demo__pass--done')).toHaveLength(4)
    expect(screen.getByText(/drops a cent on EUR → GBP refunds/)).toBeInTheDocument()
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

    it('runs the passes in parallel, posts a finding and verifies it before calling the review done', async () => {
      const { container } = render(<PrReviewDemo />)
      intersect()

      expect(container.querySelectorAll('.lp-pr-demo__pass--running')).toHaveLength(4)
      expect(screen.queryByText('Major')).not.toBeInTheDocument()

      await advance(1700)
      expect(container.querySelectorAll('.lp-pr-demo__pass--done')).toHaveLength(2)

      await advance(1300)
      expect(container.querySelectorAll('.lp-pr-demo__pass--done')).toHaveLength(4)
      expect(screen.getByText('Verifying…')).toBeInTheDocument()
      expect(screen.queryByText('Review posted')).not.toBeInTheDocument()

      await advance(1800)
      expect(screen.getByText('✓ Verified')).toBeInTheDocument()
      expect(screen.getByText('Review posted')).toBeInTheDocument()

      await advance(4400)
      expect(screen.queryByText('Major')).not.toBeInTheDocument()
    })
  })
})
