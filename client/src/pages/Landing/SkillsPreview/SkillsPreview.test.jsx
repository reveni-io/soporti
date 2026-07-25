import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SkillsPreview from './SkillsPreview.jsx'

describe('SkillsPreview', () => {
  it('renders the sent message with its skill badge when there is no IntersectionObserver', () => {
    const { container } = render(<SkillsPreview />)
    expect(container.querySelector('.lp-skills-preview__badge').textContent).toBe('/triage-ticket')
    expect(screen.getByText(/the customer says the refund never arrived/i)).toBeInTheDocument()
  })

  it('renders the static final state when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const { container } = render(<SkillsPreview />)
    expect(container.querySelector('.lp-skills-preview__badge')).toBeTruthy()
    expect(container.querySelector('.lp-skills-preview__menu')).toBeNull()
    vi.unstubAllGlobals()
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

    const advance = async ms => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
      })
    }

    it('waits for the composer to scroll into view', async () => {
      const { container } = render(<SkillsPreview />)
      intersect(false)
      await advance(2000)
      expect(container.querySelector('.lp-skills-preview__placeholder')).toBeTruthy()
      expect(container.querySelector('.lp-skills-preview__badge')).toBeNull()
    })

    it('opens the autocomplete with the skills matching what is typed', async () => {
      const { container } = render(<SkillsPreview />)
      intersect(true)
      await advance(1300)

      expect(container.querySelector('.lp-skills-preview__typed').textContent).toContain('/tr')
      expect(screen.getByText('/triage-ticket')).toBeInTheDocument()
      expect(screen.getByText('/trace-order')).toBeInTheDocument()
      expect(screen.queryByText('/code-review')).not.toBeInTheDocument()
    })

    it('completes the command, highlights it and closes the menu', async () => {
      const { container } = render(<SkillsPreview />)
      intersect(true)
      await advance(3000)

      expect(container.querySelector('.lp-skills-preview__command').textContent).toBe('/triage-ticket')
      expect(container.querySelector('.lp-skills-preview__menu')).toBeNull()
    })

    it('sends the message and renders it with the skill badge', async () => {
      const { container } = render(<SkillsPreview />)
      intersect(true)
      await advance(7000)

      expect(container.querySelector('.lp-skills-preview__badge').textContent).toBe('/triage-ticket')
      expect(screen.getByText(/the customer says the refund never arrived/i)).toBeInTheDocument()
      expect(container.querySelector('.lp-skills-preview__placeholder')).toBeTruthy()
    })
  })
})
