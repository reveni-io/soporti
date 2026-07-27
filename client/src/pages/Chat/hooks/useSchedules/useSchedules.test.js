import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSchedules } from './useSchedules.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockList(schedules = []) {
  return { ok: true, status: 200, json: async () => ({ schedules }) }
}

describe('useSchedules', () => {
  it('loads the schedules with the auth header', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockList([{ id: 1, question: 'Failed payments' }]))

    const { result } = renderHook(() => useSchedules('tok', vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.schedules).toEqual([{ id: 1, question: 'Failed payments' }])
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/schedules')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('does not fetch without a token', () => {
    global.fetch = vi.fn()

    renderHook(() => useSchedules(null, vi.fn()))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls onUnauthorized on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onUnauthorized = vi.fn()

    renderHook(() => useSchedules('tok', onUnauthorized))

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
  })

  it('exposes an error when the load fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const { result } = renderHook(() => useSchedules('tok', vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Failed to load the scheduled queries'))
  })

  it('refetches on reload', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([]))
      .mockResolvedValueOnce(mockList([{ id: 2, question: 'Open PRs' }]))

    const { result } = renderHook(() => useSchedules('tok', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.schedules).toEqual([{ id: 2, question: 'Open PRs' }])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
