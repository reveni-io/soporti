import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import BotsTile from './BotsTile.jsx'

describe('BotsTile', () => {
  it('shows the whole story when there is no IntersectionObserver', () => {
    render(<BotsTile />)

    expect(screen.getByText('Ticket Triage')).toBeInTheDocument()
    expect(screen.getByText(/every weekday at 17:00, tell me which new tickets are urgent/i)).toBeInTheDocument()
    expect(screen.getByText('Daily ticket sweep')).toBeInTheDocument()
    expect(screen.getByText('Weekdays · 17:00')).toBeInTheDocument()
    expect(screen.getByText('2 urgent out of 14 new tickets')).toBeInTheDocument()
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

    it('creates the routine, runs it and reports, then starts over', async () => {
      render(<BotsTile />)
      intersect()

      expect(screen.queryByText('Daily ticket sweep')).not.toBeInTheDocument()

      await advance(1600)
      expect(screen.getByText('Weekdays · 17:00')).toBeInTheDocument()
      expect(screen.queryByText('2 urgent out of 14 new tickets')).not.toBeInTheDocument()

      await advance(2200)
      expect(screen.getByText('Running now')).toBeInTheDocument()

      await advance(2400)
      expect(screen.getByText('2 urgent out of 14 new tickets')).toBeInTheDocument()
      expect(screen.getByText('Weekdays · 17:00')).toBeInTheDocument()

      await advance(4800)
      expect(screen.queryByText('Daily ticket sweep')).not.toBeInTheDocument()
    })
  })
})
