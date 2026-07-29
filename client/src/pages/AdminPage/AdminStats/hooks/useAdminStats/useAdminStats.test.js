import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAdminStats } from './useAdminStats.js'

const STATS = { days: null, conversations: 40 }

function okResponse(stats) {
  return { ok: true, status: 200, json: async () => ({ stats }) }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useAdminStats', () => {
  it('loads all time on mount', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse(STATS))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAdminStats('tok', onLogout))

    await waitFor(() => expect(result.current.stats).toEqual(STATS))
    expect(result.current.range).toBe('all')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/stats?days=all')
  })

  it('reloads with the range the caller selects', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(okResponse(STATS))
      .mockResolvedValueOnce(okResponse({ days: 7, conversations: 6 }))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAdminStats('tok', onLogout))
    await waitFor(() => expect(result.current.stats).toEqual(STATS))

    act(() => {
      result.current.setRange('7')
    })

    await waitFor(() => expect(result.current.stats).toEqual({ days: 7, conversations: 6 }))
    expect(global.fetch.mock.calls[1][0]).toContain('/api/admin/stats?days=7')
  })

  it('drops a stale error while the next range is loading', async () => {
    let resolveSecond
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Failed to load the stats.' }) })
      .mockReturnValueOnce(new Promise(resolve => (resolveSecond = resolve)))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAdminStats('tok', onLogout))
    await waitFor(() => expect(result.current.error).toBe('Failed to load the stats.'))

    act(() => {
      result.current.setRange('7')
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()

    await act(async () => {
      resolveSecond(okResponse({ days: 7, conversations: 6 }))
    })

    expect(result.current.stats).toEqual({ days: 7, conversations: 6 })
  })

  it('exposes the message of a failure that is not a 401', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed to load the stats.' }) })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAdminStats('tok', onLogout))

    await waitFor(() => expect(result.current.error).toBe('Failed to load the stats.'))
    expect(result.current.loading).toBe(false)
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAdminStats('expired', onLogout))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('does not log out when the 401 lands after unmount', async () => {
    let resolveRequest
    global.fetch = vi.fn().mockReturnValue(new Promise(resolve => (resolveRequest = resolve)))
    const onLogout = vi.fn()

    const { unmount } = renderHook(() => useAdminStats('expired', onLogout))
    unmount()

    await act(async () => {
      resolveRequest({ ok: false, status: 401, json: async () => ({}) })
    })

    expect(onLogout).not.toHaveBeenCalled()
  })
})
