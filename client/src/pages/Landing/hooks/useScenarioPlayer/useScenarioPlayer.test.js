import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScenarioPlayer } from './useScenarioPlayer.js'

const SCENARIOS = [
  {
    question: 'How many returns?',
    tools: [{ emoji: '🗄️', label: 'Querying database', detail: 'returns', duration: '1.2s' }],
    answer: [{ t: 'Acme had ' }, { t: '1,284 returns', b: true }],
  },
]

function stubReducedMotion(reduce) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduce }))
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useScenarioPlayer', () => {
  it('shows the first scenario fully resolved when motion is reduced', () => {
    stubReducedMotion(true)

    const { result } = renderHook(() => useScenarioPlayer(SCENARIOS))

    expect(result.current).toEqual([
      { role: 'user', text: 'How many returns?' },
      {
        role: 'assistant',
        phase: 'answer',
        tools: [{ ...SCENARIOS[0].tools[0], done: true }],
        answer: SCENARIOS[0].answer,
      },
    ])
  })

  it('plays the question, the thinking state, the tools and then the answer', async () => {
    stubReducedMotion(false)
    vi.useFakeTimers()

    const { result } = renderHook(() => useScenarioPlayer(SCENARIOS))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toEqual([{ role: 'user', text: 'How many returns?' }])

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current[1].phase).toBe('thinking')

    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    expect(result.current[1].tools).toEqual([{ ...SCENARIOS[0].tools[0], done: false }])

    await act(async () => {
      vi.advanceTimersByTime(1250)
    })
    expect(result.current[1].tools[0].done).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(450 + 170)
    })
    expect(result.current[1].phase).toBe('answer')
    expect(result.current[1].answer).toEqual([{ t: 'Acme had ' }])

    await act(async () => {
      vi.advanceTimersByTime(170)
    })
    expect(result.current[1].answer).toEqual(SCENARIOS[0].answer)
  })

  it('stops the animation on unmount', async () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    const { unmount } = renderHook(() => useScenarioPlayer(SCENARIOS))
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    unmount()

    expect(clearSpy).toHaveBeenCalled()
  })

  it('survives an environment without matchMedia', async () => {
    vi.stubGlobal('matchMedia', undefined)
    vi.useFakeTimers()

    const { result } = renderHook(() => useScenarioPlayer(SCENARIOS))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toEqual([{ role: 'user', text: 'How many returns?' }])
  })
})
