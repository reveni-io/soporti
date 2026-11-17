import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useBotRoutines } from './useBotRoutines.js'

const ROUTINE = { id: 9, title: 'Queue review', paused: false }

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useBotRoutines', () => {
  it('loads the routines of the bot', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ routines: [ROUTINE] }))

    const { result } = renderHook(() => useBotRoutines('tok', 3, vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.routines).toEqual([ROUTINE])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe('/api/bots/3/routines')
  })

  it('reloads the routines after pausing one', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ routines: [ROUTINE] }))
      .mockResolvedValueOnce(respond({ routine: { ...ROUTINE, paused: true } }))
      .mockResolvedValue(respond({ routines: [{ ...ROUTINE, paused: true }] }))

    const { result } = renderHook(() => useBotRoutines('tok', 3, vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.togglePaused(ROUTINE)
    })

    expect(global.fetch).toHaveBeenCalledTimes(3)
    expect(global.fetch.mock.calls[1][0]).toBe('/api/bots/3/routines/9')
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ paused: true })
    expect(result.current.routines).toEqual([{ ...ROUTINE, paused: true }])
  })

  it('keeps the list and exposes the error when a change fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ routines: [ROUTINE] }))
      .mockResolvedValue(respond({}, 500))

    const { result } = renderHook(() => useBotRoutines('tok', 3, vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.remove(9)
    })

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.actionError).toBe('Failed to delete the routine')
    expect(result.current.routines).toEqual([ROUTINE])
  })

  it('logs out when a change answers 401', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ routines: [ROUTINE] }))
      .mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useBotRoutines('tok', 3, onLogout))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.togglePaused(ROUTINE)
    })

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.actionError).toBeNull()
  })
})
