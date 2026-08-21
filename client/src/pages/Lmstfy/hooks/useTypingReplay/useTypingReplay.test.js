import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useTypingReplay,
  OPENING_PHASE,
  ADDRESS_PHASE,
  URL_PHASE,
  LOADING_PHASE,
  COMPOSER_PHASE,
  QUESTION_PHASE,
  SEND_PHASE,
  PRESSING_PHASE,
  DONE_PHASE,
} from './useTypingReplay.js'

const navigate = vi.fn()
vi.mock('react-router-dom', async importOriginal => {
  const original = await importOriginal()
  return { ...original, useNavigate: () => navigate }
})

const QUESTION = 'why?'
const SITE_URL = window.location.host

function advance(ms) {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function prefersReducedMotion(matches) {
  window.matchMedia = vi.fn(() => ({ matches }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  prefersReducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTypingReplay', () => {
  it('opens the window before touching anything', async () => {
    const { result } = renderHook(() => useTypingReplay(QUESTION))

    expect(result.current.phase).toBe(OPENING_PHASE)
    expect(result.current.typedUrl).toBe('')
    expect(result.current.typedQuestion).toBe('')

    await advance(550)
    expect(result.current.phase).toBe(ADDRESS_PHASE)
  })

  it('types the host the visitor is actually on, not a hardcoded domain', async () => {
    const { result } = renderHook(() => useTypingReplay(QUESTION))

    await advance(550 + 520 + 200 + 60 * SITE_URL.length)

    expect(SITE_URL).not.toBe('')
    expect(result.current.typedUrl).toBe(window.location.host)
  })

  it('clicks the address bar and types the site url one character at a time', async () => {
    const { result } = renderHook(() => useTypingReplay(QUESTION))

    await advance(550)
    await advance(520)
    expect(result.current.isClicking).toBe(true)

    await advance(200)
    expect(result.current.isClicking).toBe(false)
    expect(result.current.phase).toBe(URL_PHASE)

    await advance(60)
    expect(result.current.typedUrl).toBe(SITE_URL.slice(0, 1))

    await advance(60)
    expect(result.current.typedUrl).toBe(SITE_URL.slice(0, 2))

    await advance(60 * (SITE_URL.length - 2))
    expect(result.current.typedUrl).toBe(SITE_URL)
  })

  it('loads the page, then clicks the composer and types the question', async () => {
    const { result } = renderHook(() => useTypingReplay(QUESTION))

    await advance(550 + 520 + 200 + 60 * SITE_URL.length)
    expect(result.current.phase).toBe(URL_PHASE)

    await advance(260)
    expect(result.current.phase).toBe(LOADING_PHASE)

    await advance(600)
    expect(result.current.phase).toBe(COMPOSER_PHASE)
    expect(result.current.typedQuestion).toBe('')

    await advance(520)
    expect(result.current.isClicking).toBe(true)

    await advance(200)
    expect(result.current.phase).toBe(QUESTION_PHASE)

    await advance(40)
    expect(result.current.typedQuestion).toBe('w')

    await advance(40 * 3)
    expect(result.current.typedQuestion).toBe('why?')
  })

  it('reaches the send button, presses it and hands over to the chat', async () => {
    const { result } = renderHook(() => useTypingReplay(QUESTION))

    await advance(550 + 520 + 200 + 60 * SITE_URL.length + 260 + 600 + 520 + 200 + 40 * QUESTION.length)
    expect(result.current.phase).toBe(QUESTION_PHASE)

    await advance(260)
    expect(result.current.phase).toBe(SEND_PHASE)

    await advance(450)
    expect(result.current.phase).toBe(PRESSING_PHASE)
    expect(result.current.isClicking).toBe(true)
    expect(navigate).not.toHaveBeenCalled()

    await advance(300)
    expect(result.current.phase).toBe(DONE_PHASE)
    expect(result.current.isClicking).toBe(false)
    expect(navigate).not.toHaveBeenCalled()

    await advance(450)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/chat?q=why%3F')
  })

  it('skips the theatre when the visitor prefers reduced motion', async () => {
    prefersReducedMotion(true)

    const { result } = renderHook(() => useTypingReplay(QUESTION))

    expect(result.current.phase).toBe(DONE_PHASE)
    expect(result.current.typedUrl).toBe(SITE_URL)
    expect(result.current.typedQuestion).toBe('why?')

    await advance(450)
    expect(navigate).toHaveBeenCalledWith('/chat?q=why%3F')
  })

  it('stops the script and never navigates once it is unmounted', async () => {
    const { result, unmount } = renderHook(() => useTypingReplay(QUESTION))

    await advance(550)
    expect(result.current.phase).toBe(ADDRESS_PHASE)

    unmount()
    await advance(10000)

    expect(navigate).not.toHaveBeenCalled()
  })
})
