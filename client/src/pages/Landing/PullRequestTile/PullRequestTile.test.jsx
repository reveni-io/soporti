import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import PullRequestTile from './PullRequestTile.jsx'

describe('PullRequestTile', () => {
  it('shows the request turned into a draft pull request when there is no IntersectionObserver', () => {
    const { container } = render(<PullRequestTile />)

    expect(screen.getByText(/say “store credit” instead of “refund”/i)).toBeInTheDocument()
    expect(screen.getByText('acme/storefront')).toBeInTheDocument()
    expect(screen.getByText('Draft · #312')).toBeInTheDocument()
    expect(screen.getByText('Say “store credit” on the checkout banner')).toBeInTheDocument()
    expect(screen.getByText('soporti/store-credit-copy')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('CI running')).toBeInTheDocument()
    expect(container.querySelector('.lp-pr-tile__skeleton')).not.toBeInTheDocument()
  })

  it('shows a one-line diff of the edited file', () => {
    const { container } = render(<PullRequestTile />)

    expect(screen.getByText('src/CheckoutBanner.jsx')).toBeInTheDocument()
    expect(container.querySelector('.lp-pr-tile__line--removed')).toHaveTextContent('-label="Return it for a refund"')
    expect(container.querySelector('.lp-pr-tile__line--added')).toHaveTextContent('+label="Return it for store credit"')
    expect(screen.getByText('a refund').tagName).toBe('MARK')
    expect(screen.getByText('store credit').tagName).toBe('MARK')
  })

  it('lists the finished steps of the assistant, from reading the file to opening the pull request', () => {
    render(<PullRequestTile />)

    const steps = screen.getAllByRole('listitem', { hidden: true }).map(step => step.textContent)
    expect(steps).toEqual(['Reading fileCheckoutBanner.jsx', 'Editing fileCheckoutBanner.jsx', 'Opening pull request'])
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

    it('reads the file, edits it, opens the draft pull request, then starts over', async () => {
      const { container } = render(<PullRequestTile />)
      intersect()

      expect(screen.queryAllByRole('listitem', { hidden: true })).toHaveLength(0)
      expect(container.querySelectorAll('.lp-pr-tile__skeleton')).toHaveLength(3)

      await advance(1200)
      expect(screen.getByText('Reading file')).toBeInTheDocument()
      expect(screen.queryByText('src/CheckoutBanner.jsx')).not.toBeInTheDocument()

      await advance(1400)
      expect(screen.getByText('src/CheckoutBanner.jsx')).toBeInTheDocument()
      expect(screen.getByText('soporti/store-credit-copy')).toBeInTheDocument()
      expect(screen.queryByText('Draft · #312')).not.toBeInTheDocument()
      expect(container.querySelectorAll('.lp-pr-tile__skeleton')).toHaveLength(1)

      await advance(1800)
      expect(screen.getByText('Opening pull request')).toBeInTheDocument()
      expect(screen.queryByText('CI running')).not.toBeInTheDocument()

      await advance(1600)
      expect(screen.getByText('Draft · #312')).toBeInTheDocument()
      expect(screen.getByText('Say “store credit” on the checkout banner')).toBeInTheDocument()
      expect(screen.getByText('CI running')).toBeInTheDocument()
      expect(container.querySelector('.lp-pr-tile__skeleton')).not.toBeInTheDocument()

      await advance(5200)
      expect(screen.queryAllByRole('listitem', { hidden: true })).toHaveLength(0)
      expect(screen.queryByText('Draft · #312')).not.toBeInTheDocument()
    })
  })
})
