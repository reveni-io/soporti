import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import QueryGuard from './QueryGuard.jsx'

describe('QueryGuard', () => {
  it('shows every verdict when there is no IntersectionObserver', () => {
    render(<QueryGuard />)

    expect(screen.getByText('✓ Ran in a read-only transaction')).toBeInTheDocument()
    expect(screen.getAllByText('✕ Rejected · read-only transaction')).toHaveLength(2)
    expect(screen.getByText('⦸ Secret redacted before it was posted')).toBeInTheDocument()
    expect(screen.getByText('Posting to #support: "api_key": "[redacted]"')).toBeInTheDocument()
    expect(screen.queryByText(/sk_live/)).not.toBeInTheDocument()
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

    it('checks each statement before deciding, and only redacts the secret once it is decided', async () => {
      render(<QueryGuard />)
      intersect()

      expect(screen.getByText('Checking…')).toBeInTheDocument()
      expect(screen.queryByText(/UPDATE orders/)).not.toBeInTheDocument()

      await advance(900)
      expect(screen.getByText('✓ Ran in a read-only transaction')).toBeInTheDocument()

      await advance(1100)
      expect(screen.getByText(/UPDATE orders/).closest('li')).toHaveClass('lp-guard__check--checking')

      await advance(4100)
      expect(screen.getByText(/sk_live/)).toBeInTheDocument()

      await advance(900)
      expect(screen.queryByText(/sk_live/)).not.toBeInTheDocument()
      expect(screen.getByText(/\[redacted\]/).closest('li')).toHaveClass('lp-guard__check--redacted')
    })
  })
})
