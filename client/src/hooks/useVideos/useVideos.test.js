import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVideos } from './useVideos.js'

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function summary(id, status) {
  return { id, title: id, status, phase: null, progress: null, format: '16:9', durationSeconds: 30 }
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

describe('useVideos', () => {
  it('lists the videos from the api', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ videos: [summary('a', 'ready')] }))

    const { result } = renderHook(() => useVideos('tok', vi.fn()))
    expect(result.current.videos).toEqual([])
    await advance(0)

    expect(result.current.loading).toBe(false)
    expect(result.current.videos).toEqual([summary('a', 'ready')])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe('/api/videos')
  })

  it.each(['drafting', 'queued', 'running'])('polls every 5 seconds while a video is %s', async status => {
    global.fetch = vi.fn().mockResolvedValue(respond({ videos: [summary('a', 'ready'), summary('b', status)] }))

    renderHook(() => useVideos('tok', vi.fn()))
    await advance(0)
    await advance(4999)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await advance(1)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('stops polling once no video is in progress', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ videos: [summary('a', 'running')] }))
      .mockResolvedValue(respond({ videos: [summary('a', 'ready')] }))

    const { result } = renderHook(() => useVideos('tok', vi.fn()))
    await advance(0)
    await advance(5000)
    await advance(20000)

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.videos[0].status).toBe('ready')
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useVideos('tok', onLogout))
    await advance(0)

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it.each([
    ['queued', true],
    ['running', true],
    ['drafting', false],
    ['ready', false],
  ])('tells whether a video is being generated when one is %s', async (status, expected) => {
    global.fetch = vi.fn().mockResolvedValue(respond({ videos: [summary('a', 'failed'), summary('b', status)] }))

    const { result } = renderHook(() => useVideos('tok', vi.fn()))
    expect(result.current.isGenerating).toBe(false)
    await advance(0)

    expect(result.current.isGenerating).toBe(expected)
  })
})
