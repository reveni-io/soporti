import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import VideosTile from './VideosTile.jsx'

function phase(name) {
  return screen.getByText(name).closest('li')
}

describe('VideosTile', () => {
  it('shows a rendered video when there is no IntersectionObserver', () => {
    const { container } = render(<VideosTile />)

    expect(screen.getByText('Emails that sound like you')).toBeInTheDocument()
    expect(screen.getByText('MP4 · 1080p · 0:30')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-videos-tile__phase--done')).toHaveLength(5)
    expect(screen.getByText('16:9')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-videos-tile__wave span').length).toBeGreaterThan(0)
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

    it('walks through the generation phases until the MP4 is ready, then starts over', async () => {
      render(<VideosTile />)
      intersect()

      expect(phase('Storyboard')).toHaveClass('lp-videos-tile__phase--done')
      expect(phase('Composing')).toHaveClass('lp-videos-tile__phase--current')
      expect(phase('Ready')).toHaveClass('lp-videos-tile__phase--pending')

      await advance(1500)
      expect(phase('Music')).toHaveClass('lp-videos-tile__phase--current')

      await advance(1500)
      expect(phase('Rendering')).toHaveClass('lp-videos-tile__phase--current')
      expect(screen.queryByText('MP4 · 1080p · 0:30')).not.toBeInTheDocument()

      await advance(2600)
      expect(screen.getByText('MP4 · 1080p · 0:30')).toBeInTheDocument()
      expect(phase('Ready')).toHaveClass('lp-videos-tile__phase--done')

      await advance(4400)
      expect(phase('Composing')).toHaveClass('lp-videos-tile__phase--current')
    })
  })
})
