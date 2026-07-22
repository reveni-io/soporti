import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import HeroChat from './HeroChat.jsx'

describe('HeroChat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the chat window chrome', () => {
    render(<HeroChat />)
    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(screen.getByText('YOLO')).toBeInTheDocument()
  })

  it('plays the first question as the loop advances', async () => {
    render(<HeroChat />)
    // Loop clears (500ms) then posts the first user question.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(screen.getByText(/how many returns did acme get/i)).toBeInTheDocument()
  })

  it('renders a static exchange when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    render(<HeroChat />)
    expect(screen.getByText(/how many returns did acme get/i)).toBeInTheDocument()
    // Static branch shows the finished answer right away.
    expect(screen.getByText('1,284 returns')).toBeInTheDocument()
  })

  it('shows the thinking indicator after the question lands', async () => {
    const { container } = render(<HeroChat />)
    // 500ms clear + 1000ms after the question → the assistant starts thinking.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    expect(container.querySelector('.message__typing')).toBeTruthy()
  })

  it('runs a tool and marks it done with its duration', async () => {
    render(<HeroChat />)
    // 500ms clear + 1000ms question + 1200ms thinking → first tool is running.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2800)
    })
    expect(screen.getByText('Querying database')).toBeInTheDocument()
    expect(screen.getByText('returns · merchant Acme')).toBeInTheDocument()
    expect(screen.queryByText('1.2s')).not.toBeInTheDocument()
    // 1250ms later the tool completes: ✓ plus its duration.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1250)
    })
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByText('1.2s')).toBeInTheDocument()
  })

  it('streams the answer token by token', async () => {
    render(<HeroChat />)
    // The answer starts streaming ~4.4s in — only the first token is visible.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500)
    })
    expect(screen.getByText(/acme had/i)).toBeInTheDocument()
    expect(screen.queryByText('wrong size')).not.toBeInTheDocument()
    // 170ms per token → the full answer is out shortly after.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    expect(screen.getByText('wrong size')).toBeInTheDocument()
    expect(screen.getByText(/\(38%\)\./)).toBeInTheDocument()
  })

  it('advances to the next scenario after the full exchange', async () => {
    render(<HeroChat />)
    // Full first scenario ≈ 10.1s, then the loop clears and posts question 2.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10700)
    })
    expect(screen.getByText(/look up order #1024 in shopify/i)).toBeInTheDocument()
    expect(screen.queryByText(/how many returns did acme get/i)).not.toBeInTheDocument()
  })
})
