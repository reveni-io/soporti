import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import ScheduleDemo from './ScheduleDemo.jsx'

describe('ScheduleDemo', () => {
  it('shows today’s run posted to the channel when there is no IntersectionObserver', () => {
    render(<ScheduleDemo />)

    expect(screen.getByText(/every morning at 9, summarize the new sentry issues/i)).toBeInTheDocument()
    expect(screen.getByText('Daily · 09:00 Europe/Madrid')).toBeInTheDocument()
    expect(screen.getByText('Posted to #support · 2 new issues')).toBeInTheDocument()
    expect(screen.getByText('2 new Sentry issues since yesterday')).toBeInTheDocument()
    expect(screen.getByText('Posted to #support · nothing new')).toBeInTheDocument()
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

    it('waits for the next run, runs it and posts the summary', async () => {
      render(<ScheduleDemo />)
      intersect()

      expect(screen.getByText('Next run at 09:00')).toBeInTheDocument()
      expect(screen.queryByText('2 new Sentry issues since yesterday')).not.toBeInTheDocument()

      await advance(1800)
      expect(screen.getByText('Running now…')).toBeInTheDocument()

      await advance(2200)
      expect(screen.getByText('2 new Sentry issues since yesterday')).toBeInTheDocument()
      expect(screen.getByText('Posted')).toBeInTheDocument()

      await advance(5000)
      expect(screen.getByText('Next run at 09:00')).toBeInTheDocument()
    })
  })
})
