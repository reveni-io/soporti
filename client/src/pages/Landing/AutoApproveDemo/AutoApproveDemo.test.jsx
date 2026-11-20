import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import AutoApproveDemo from './AutoApproveDemo.jsx'

describe('AutoApproveDemo', () => {
  it('shows the approved pull request when there is no IntersectionObserver', () => {
    const { container } = render(<AutoApproveDemo />)

    expect(screen.getByText('Clarify the return window on the help page')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('✅ Auto-approve · approved')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-approve-demo__check--done')).toHaveLength(5)
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

    it('checks the rules, then the question, and approves only at the end', async () => {
      const { container } = render(<AutoApproveDemo />)
      act(() => {
        observers.forEach(observer =>
          observer.elements.forEach(element => observer.callback([{ isIntersecting: true, target: element }]))
        )
      })

      expect(container.querySelectorAll('.lp-approve-demo__check--running')).toHaveLength(5)

      await advance(1500)
      expect(container.querySelectorAll('.lp-approve-demo__check--done')).toHaveLength(4)
      expect(screen.queryByText('Approved')).not.toBeInTheDocument()

      await advance(1500)
      expect(container.querySelectorAll('.lp-approve-demo__check--done')).toHaveLength(5)
      expect(screen.queryByText('✅ Auto-approve · approved')).not.toBeInTheDocument()

      await advance(1600)
      expect(screen.getByText('Approved')).toBeInTheDocument()
      expect(screen.getByText('✅ Auto-approve · approved')).toBeInTheDocument()
    })
  })
})
