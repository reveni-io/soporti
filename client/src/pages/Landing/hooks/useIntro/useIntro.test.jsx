import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { INTRO_PHASES, useIntro } from './useIntro.js'

const SEEN_KEY = 'soporti_landing_intro_seen'

async function advance(ms) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function SkippableIntro() {
  const { phase, skip } = useIntro()

  return (
    <button type="button" onClick={skip}>
      {phase}
    </button>
  )
}

describe('useIntro', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('plays, leaves and finishes on its own, and remembers it was seen this session', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useIntro())

    expect(result.current.phase).toBe(INTRO_PHASES.PLAYING)

    await advance(2300)
    expect(result.current.phase).toBe(INTRO_PHASES.LEAVING)
    expect(sessionStorage.getItem(SEEN_KEY)).toBe('1')

    await advance(1100)
    expect(result.current.phase).toBe(INTRO_PHASES.DONE)
  })

  it('does not play again once it was seen this session', () => {
    sessionStorage.setItem(SEEN_KEY, '1')

    const { result } = renderHook(() => useIntro())

    expect(result.current.phase).toBe(INTRO_PHASES.DONE)
  })

  it('does not play when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    const { result } = renderHook(() => useIntro())

    expect(result.current.phase).toBe(INTRO_PHASES.DONE)
  })

  it('leaves right away when skipped, and skipping again changes nothing', async () => {
    const user = userEvent.setup()
    render(<SkippableIntro />)

    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent(INTRO_PHASES.LEAVING)

    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent(INTRO_PHASES.LEAVING)
  })

  it('leaves as soon as a key is pressed', () => {
    const { result } = renderHook(() => useIntro())

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(result.current.phase).toBe(INTRO_PHASES.LEAVING)
  })

  it('leaves as soon as the page is scrolled, and stops listening once it is gone', async () => {
    vi.useFakeTimers()
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const { result } = renderHook(() => useIntro())

    act(() => {
      window.dispatchEvent(new WheelEvent('wheel'))
    })
    expect(result.current.phase).toBe(INTRO_PHASES.LEAVING)
    expect(removeListener).toHaveBeenCalledWith('wheel', expect.any(Function))
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function))

    await advance(1100)
    expect(result.current.phase).toBe(INTRO_PHASES.DONE)
  })

  it('still plays when session storage is unavailable', async () => {
    vi.useFakeTimers()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    const { result } = renderHook(() => useIntro())
    expect(result.current.phase).toBe(INTRO_PHASES.PLAYING)

    await advance(2300)
    expect(result.current.phase).toBe(INTRO_PHASES.LEAVING)

    await advance(1100)
    expect(result.current.phase).toBe(INTRO_PHASES.DONE)
  })
})
