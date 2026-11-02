import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { listVideos } from '../../services/services.js'
import { usePolledResource } from './usePolledResource.js'

const INTERVAL_MS = 1000
const RUNNING = { videos: [{ id: 'a', status: 'running' }] }
const READY = { videos: [{ id: 'a', status: 'ready' }] }

function isRunning(data) {
  return data.videos.some(video => video.status === 'running')
}

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

describe('usePolledResource', () => {
  it('loads the resource once with the token when nothing is in progress', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(READY))

    const { result } = renderHook(() =>
      usePolledResource(listVideos, { token: 'tok', intervalMs: INTERVAL_MS, shouldPoll: isRunning })
    )
    await advance(0)
    await advance(INTERVAL_MS * 3)

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toEqual(READY)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('polls while the resource is in progress and stops once it settles', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(RUNNING))
      .mockResolvedValueOnce(respond(RUNNING))
      .mockResolvedValue(respond(READY))

    const { result } = renderHook(() =>
      usePolledResource(listVideos, { token: 'tok', intervalMs: INTERVAL_MS, shouldPoll: isRunning })
    )
    await advance(0)
    expect(result.current.data).toEqual(RUNNING)

    await advance(INTERVAL_MS)
    await advance(INTERVAL_MS)
    expect(result.current.data).toEqual(READY)

    await advance(INTERVAL_MS * 5)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('stops polling on unmount', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(RUNNING))

    const { unmount } = renderHook(() =>
      usePolledResource(listVideos, { token: 'tok', intervalMs: INTERVAL_MS, shouldPoll: isRunning })
    )
    await advance(0)
    await advance(INTERVAL_MS)
    unmount()
    await advance(INTERVAL_MS * 5)

    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('starts polling when new data is set in progress', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(respond(READY)).mockResolvedValue(respond(READY))

    const { result } = renderHook(() =>
      usePolledResource(listVideos, { token: 'tok', intervalMs: INTERVAL_MS, shouldPoll: isRunning })
    )
    await advance(0)
    act(() => result.current.setData(RUNNING))
    await advance(INTERVAL_MS)

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.data).toEqual(READY)
  })

  it('exposes the error and clears it on the next successful poll', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(RUNNING))
      .mockResolvedValueOnce(respond({}, 500))
      .mockResolvedValue(respond(READY))

    const { result } = renderHook(() =>
      usePolledResource(listVideos, { token: 'tok', intervalMs: INTERVAL_MS, shouldPoll: isRunning })
    )
    await advance(0)
    await advance(INTERVAL_MS)
    expect(result.current.error).toBe('Failed to load your videos')
    expect(result.current.data).toEqual(RUNNING)

    await advance(INTERVAL_MS)
    expect(result.current.error).toBeNull()
    expect(result.current.data).toEqual(READY)
  })

  it('logs out on a 401 without exposing an error', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() =>
      usePolledResource(listVideos, { token: 'tok', intervalMs: INTERVAL_MS, shouldPoll: isRunning, onLogout })
    )
    await advance(0)

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('ignores a response that lands after unmount', async () => {
    let resolveFetch
    global.fetch = vi.fn().mockReturnValue(new Promise(resolve => (resolveFetch = resolve)))

    const { result, unmount } = renderHook(() =>
      usePolledResource(listVideos, { token: 'tok', intervalMs: INTERVAL_MS, shouldPoll: isRunning })
    )
    unmount()
    resolveFetch(respond(RUNNING))
    await advance(INTERVAL_MS * 3)

    expect(result.current.data).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not fetch without a token', async () => {
    global.fetch = vi.fn()

    const { result } = renderHook(() =>
      usePolledResource(listVideos, { token: null, intervalMs: INTERVAL_MS, shouldPoll: isRunning })
    )
    await advance(INTERVAL_MS)

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(true)
  })
})
