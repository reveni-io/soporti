import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import AnalyticsTile from './AnalyticsTile.jsx'

describe('AnalyticsTile', () => {
  it('shows the finished dashboard when there is no IntersectionObserver', () => {
    const { container } = render(<AnalyticsTile />)

    expect(screen.getAllByText('Returns per week, by status')).toHaveLength(2)
    expect(screen.getByText('1,284')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-analytics-tile__column')).toHaveLength(8)
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-analytics-tile__line')).toHaveLength(2)
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

    it('narrates each step of the agent before drawing the chart, then starts over', async () => {
      render(<AnalyticsTile />)
      intersect()

      expect(screen.getByText('Exploring the schema…')).toBeInTheDocument()
      expect(screen.queryByText('Approved')).not.toBeInTheDocument()

      await advance(1300)
      expect(screen.getByText('Reading the columns of returns…')).toBeInTheDocument()

      await advance(1300 * 2)
      expect(screen.getByText('Drawing the chart…')).toBeInTheDocument()

      await advance(1300)
      expect(screen.getByText('Approved')).toBeInTheDocument()
      expect(screen.queryByText('Drawing the chart…')).not.toBeInTheDocument()

      await advance(4600)
      expect(screen.getByText('Exploring the schema…')).toBeInTheDocument()
    })
  })
})
