import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AutomationsSection from './AutomationsSection.jsx'

describe('AutomationsSection', () => {
  it('opens on the pull request reviews', () => {
    const { container } = render(<AutomationsSection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'automations')
    expect(
      screen.getByRole('heading', { level: 2, name: /it keeps working when nobody is asking/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /reviews every pull request/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Fix refund rounding for partial returns')
  })

  it('shows the auto-approve, the Slack thread, the scheduled query and the Legal replies when they are picked', async () => {
    const user = userEvent.setup()
    render(<AutomationsSection />)

    await user.click(screen.getByRole('tab', { name: /approves the safe pull requests/i }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Clarify the return window on the help page')

    await user.click(screen.getByRole('tab', { name: /answers in slack threads/i }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('why are refunds failing for Acme since this morning?')

    await user.click(screen.getByRole('tab', { name: /runs on a schedule/i }))
    expect(screen.getByRole('tab', { name: /runs on a schedule/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Scheduled queries')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'lp-automations-tab-schedule')

    await user.click(screen.getByRole('tab', { name: /drafts replies for legal/i }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Draft replies to the tickets Legal received yesterday')
  })

  describe('auto-advance (with IntersectionObserver)', () => {
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

    beforeEach(() => {
      observers = []
      vi.useFakeTimers()
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
      vi.stubGlobal('matchMedia', () => ({ matches: false }))
    })

    afterEach(() => {
      vi.clearAllTimers()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    it('moves on to the next automation on its own while in view', async () => {
      render(<AutomationsSection />)
      act(() => {
        observers.forEach(observer =>
          observer.elements.forEach(element => observer.callback([{ isIntersecting: true, target: element }]))
        )
      })

      expect(
        screen.getByRole('tab', { name: /reviews every pull request/i }).querySelector('.lp-progress-bar')
      ).toBeTruthy()

      await act(async () => {
        vi.advanceTimersByTime(10000)
      })

      expect(screen.getByRole('tab', { name: /approves the safe pull requests/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    })
  })
})
