import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBots } from './useBots.js'

const POLL_INTERVAL_MS = 15_000
const TRIAGER = { id: 1, name: 'Ticket triager', description: 'Triage tickets', profile: 'support', unreadCount: 0 }

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function advance(ms) {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBots', () => {
  it('starts empty and loading', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useBots('tok', vi.fn()))

    expect(result.current.bots).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('loads the bots of the user', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ bots: [TRIAGER] }))

    const { result } = renderHook(() => useBots('tok', vi.fn()))
    await advance(0)

    expect(result.current.bots).toEqual([TRIAGER])
    expect(result.current.loading).toBe(false)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe('/api/bots')
  })

  it('keeps polling so new routine results show up', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ bots: [TRIAGER] }))
      .mockResolvedValue(respond({ bots: [{ ...TRIAGER, unreadCount: 2 }] }))

    const { result } = renderHook(() => useBots('tok', vi.fn()))
    await advance(0)
    await advance(POLL_INTERVAL_MS)

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.bots[0].unreadCount).toBe(2)
  })

  it('reloads on demand', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ bots: [] }))
      .mockResolvedValue(respond({ bots: [TRIAGER] }))

    const { result } = renderHook(() => useBots('tok', vi.fn()))
    await advance(0)
    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.bots).toEqual([TRIAGER])
  })

  it('exposes the error when the bots cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 500))

    const { result } = renderHook(() => useBots('tok', vi.fn()))
    await advance(0)

    expect(result.current.error).toBe('Failed to load your bots')
    expect(result.current.bots).toEqual([])
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    renderHook(() => useBots('tok', onLogout))
    await advance(0)

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
