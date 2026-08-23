import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import ArtifactsPreview from './ArtifactsPreview.jsx'

describe('ArtifactsPreview', () => {
  it('renders the finished story when there is no IntersectionObserver', () => {
    render(<ArtifactsPreview />)

    expect(screen.getByText(/report I can share/)).toBeInTheDocument()
    expect(screen.getByText(/per-channel volume/)).toBeInTheDocument()
    expect(screen.getAllByText('Monthly support report')).toHaveLength(2)
    expect(screen.getByText('Version 2 ▾')).toBeInTheDocument()
  })

  it('renders the static final state when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))

    render(<ArtifactsPreview />)

    expect(screen.getByText('Version 2 ▾')).toBeInTheDocument()
    expect(screen.queryByText(/Ask for a deliverable/)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  describe('animation (with IntersectionObserver)', () => {
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

    it('waits for the demo to scroll into view', async () => {
      render(<ArtifactsPreview />)

      await advance(5000)

      expect(screen.getByText(/Ask for a deliverable/)).toBeInTheDocument()
      expect(screen.queryByText(/report I can share/)).not.toBeInTheDocument()
    })

    it('publishes the artifact and then iterates to a second version', async () => {
      render(<ArtifactsPreview />)
      intersect(true)

      await advance(1200)
      expect(screen.getByText(/report I can share/)).toBeInTheDocument()
      expect(screen.queryByText('Version 1 ▾')).not.toBeInTheDocument()

      await advance(1600)
      expect(screen.getByText('Version 1 ▾')).toBeInTheDocument()
      expect(screen.getByText('artifact published')).toBeInTheDocument()

      await advance(3300)
      expect(screen.getByText('Version 2 ▾')).toBeInTheDocument()
      expect(screen.getByText(/per-channel volume/)).toBeInTheDocument()
    })

    it('loops back to an empty chat after the story ends', async () => {
      render(<ArtifactsPreview />)
      intersect(true)

      await advance(10400)

      expect(screen.getByText(/Ask for a deliverable/)).toBeInTheDocument()
      expect(screen.queryByText('Version 2 ▾')).not.toBeInTheDocument()
    })
  })
})
