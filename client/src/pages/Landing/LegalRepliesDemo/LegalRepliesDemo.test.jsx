import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import LegalRepliesDemo from './LegalRepliesDemo.jsx'

describe('LegalRepliesDemo', () => {
  it('shows the drafted cases with their warnings when there is no IntersectionObserver', () => {
    const { container } = render(<LegalRepliesDemo />)

    expect(screen.getByText('Ready for Legal')).toBeInTheDocument()
    expect(screen.getByText('No warnings')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-legal-demo__status--careful')).toHaveLength(2)
    expect(screen.getByText('Nothing has been sent · Legal has the last word')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/jev/i)
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

    it('finds the tickets, drafts and reviews each one, and only then hands them to Legal', async () => {
      render(<LegalRepliesDemo />)
      act(() => {
        observers.forEach(observer =>
          observer.elements.forEach(element => observer.callback([{ isIntersecting: true, target: element }]))
        )
      })

      expect(screen.getByText('Finding the tickets in Zendesk and HubSpot…')).toBeInTheDocument()

      await advance(1400)
      expect(screen.getAllByText('Drafting…')).toHaveLength(3)

      await advance(1600)
      expect(screen.getAllByText('Reviewing…')).toHaveLength(3)
      expect(screen.queryByText('Ready for Legal')).not.toBeInTheDocument()

      await advance(1600)
      expect(screen.getByText('Ready for Legal')).toBeInTheDocument()
      expect(screen.getByText('Careful · 2 warnings')).toBeInTheDocument()
    })
  })
})
