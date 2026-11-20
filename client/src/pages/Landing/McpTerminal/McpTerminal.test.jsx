import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import McpTerminal from './McpTerminal.jsx'
import { MCP_COMMAND } from '../constants.js'

describe('McpTerminal', () => {
  it('shows the whole session when there is no IntersectionObserver', () => {
    const { container } = render(<McpTerminal />)

    expect(screen.getByText(MCP_COMMAND)).toBeInTheDocument()
    expect(screen.getByText('✓ Added HTTP MCP server soporti')).toBeInTheDocument()
    expect(screen.getByText('Why do refunds fail for merchant 812?')).toBeInTheDocument()
    expect(screen.getByText('soporti · ask_soporti')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-terminal__line--progress')).toHaveLength(3)
    expect(screen.getByText(/4 sources\./)).toBeInTheDocument()
    expect(container.querySelector('.lp-terminal__caret')).toBeInTheDocument()
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

    it('types the install command, connects and then answers the question it is asked', async () => {
      const { container } = render(<McpTerminal />)
      intersect()

      expect(container.querySelectorAll('.lp-terminal__line')).toHaveLength(0)

      await advance(700 + 28 * 4)
      expect(screen.getByText('claude mcp')).toBeInTheDocument()
      expect(container.querySelector('.lp-terminal__caret')).toBeInTheDocument()

      await advance(1600)
      expect(screen.getByText(MCP_COMMAND)).toBeInTheDocument()
      expect(screen.getByText('✓ Added HTTP MCP server soporti')).toBeInTheDocument()

      await advance(6000)
      expect(screen.getByText('Why do refunds fail for merchant 812?')).toBeInTheDocument()
      expect(screen.getByText(/4 sources\./)).toBeInTheDocument()
    })

    it('starts the session over after holding the answer', async () => {
      const { container } = render(<McpTerminal />)
      intersect()

      await advance(7700)
      expect(screen.getByText(/4 sources\./)).toBeInTheDocument()

      await advance(5900)
      expect(screen.queryByText(/4 sources\./)).not.toBeInTheDocument()
      expect(container.querySelectorAll('.lp-terminal__line--answer')).toHaveLength(0)
    })
  })
})
