import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SettingsPreview from './SettingsPreview.jsx'

describe('SettingsPreview', () => {
  it('renders the Custom instructions panel', () => {
    render(<SettingsPreview />)
    expect(screen.getByText('Custom instructions')).toBeInTheDocument()
    expect(screen.getByText(/on the Support team/i)).toBeInTheDocument()
  })

  it('shows the character count and saved state', () => {
    render(<SettingsPreview />)
    expect(screen.getByText(/\/ 50,000 characters/)).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  describe('animated typing (with IntersectionObserver)', () => {
    let observers

    class MockIntersectionObserver {
      constructor(callback) {
        this.callback = callback
        this.elements = []
        observers.push(this)
      }
      observe(el) {
        this.elements.push(el)
      }
      unobserve() {}
      disconnect() {}
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

    const intersect = isIntersecting => {
      act(() => {
        observers.forEach(io => io.elements.forEach(el => io.callback([{ isIntersecting, target: el }], io)))
      })
    }

    it('stays empty until the panel scrolls into view', () => {
      render(<SettingsPreview />)
      expect(screen.getByText('0 / 50,000 characters')).toBeInTheDocument()

      intersect(false)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getByText('0 / 50,000 characters')).toBeInTheDocument()
      expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    })

    it('types the example with a caret and live count once visible', () => {
      const { container } = render(<SettingsPreview />)
      intersect(true)
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(screen.getByText('21 / 50,000 characters')).toBeInTheDocument()
      expect(container.querySelector('.lp-ci-caret')).toBeTruthy()
      expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    })

    it('finishes typing, hides the caret and shows Saved', () => {
      const { container } = render(<SettingsPreview />)
      intersect(true)
      act(() => {
        vi.advanceTimersByTime(10000)
      })
      expect(screen.getByText(/say so instead of guessing/i)).toBeInTheDocument()
      expect(screen.getByText('Saved')).toBeInTheDocument()
      expect(container.querySelector('.lp-ci-caret')).toBeNull()
    })
  })
})
