import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScenarioPlayer } from './useScenarioPlayer.js'

const SCENARIOS = [
  {
    topic: 'data',
    question: 'How many returns?',
    tools: [{ source: 'postgres', label: 'Querying database', detail: 'returns', duration: '1.2s' }],
    answer: [{ t: 'Acme had ' }, { t: '1,284 returns', b: true }],
  },
  {
    topic: 'docs',
    question: 'What is the refund policy?',
    tools: [],
    answer: [{ t: 'Thirty days.' }],
  },
]

const FIRST_SCENARIO_MS = 500 + 1000 + 1200 + 1250 + 450 + 170 * 2 + 4500

function stubReducedMotion(reduce) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduce }))
  )
}

async function advance(ms) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

async function advanceThroughSteps(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useScenarioPlayer', () => {
  it('shows the first scenario fully resolved when motion is reduced', () => {
    stubReducedMotion(true)

    const { result } = renderHook(() => useScenarioPlayer(SCENARIOS))

    expect(result.current.index).toBe(0)
    expect(result.current.messages).toEqual([
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

    await advance(500)
    expect(result.current.messages).toEqual([{ role: 'user', text: 'How many returns?' }])

    await advance(1000)
    expect(result.current.messages[1].phase).toBe('thinking')

    await advance(1200)
    expect(result.current.messages[1].tools).toEqual([{ ...SCENARIOS[0].tools[0], done: false }])

    await advance(1250)
    expect(result.current.messages[1].tools[0].done).toBe(true)

    await advance(450 + 170)
    expect(result.current.messages[1].phase).toBe('answer')
    expect(result.current.messages[1].answer).toEqual([{ t: 'Acme had ' }])

    await advance(170)
    expect(result.current.messages[1].answer).toEqual(SCENARIOS[0].answer)
  })

  it('moves on to the next scenario, reports its index and wraps around', async () => {
    stubReducedMotion(false)
    vi.useFakeTimers()

    const { result } = renderHook(() => useScenarioPlayer(SCENARIOS))

    await advance(500)
    expect(result.current.index).toBe(0)

    await advanceThroughSteps(FIRST_SCENARIO_MS)
    expect(result.current.index).toBe(1)
    expect(result.current.messages).toEqual([{ role: 'user', text: 'What is the refund policy?' }])

    await advanceThroughSteps(1000 + 1200 + 170 + 4500 + 500)
    expect(result.current.index).toBe(0)
    expect(result.current.messages).toEqual([{ role: 'user', text: 'How many returns?' }])
  })

  it('stops the animation on unmount', async () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    const { unmount } = renderHook(() => useScenarioPlayer(SCENARIOS))
    await advance(500)
    unmount()

    expect(clearSpy).toHaveBeenCalled()
  })

  it('survives an environment without matchMedia', async () => {
    vi.stubGlobal('matchMedia', undefined)
    vi.useFakeTimers()

    const { result } = renderHook(() => useScenarioPlayer(SCENARIOS))

    await advance(500)

    expect(result.current.messages).toEqual([{ role: 'user', text: 'How many returns?' }])
  })
})
