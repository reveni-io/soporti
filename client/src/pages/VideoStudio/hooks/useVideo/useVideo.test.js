import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVideo } from './useVideo.js'

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function detail(status) {
  return { video: { id: VIDEO_ID, status, stage: status === 'drafting' ? 'drafting' : 'storyboard' } }
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

describe('useVideo', () => {
  it('loads the video by id', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(detail('storyboard')))

    const { result } = renderHook(() => useVideo('tok', VIDEO_ID, vi.fn()))
    expect(result.current.video).toBeNull()
    await advance(0)

    expect(result.current.loading).toBe(false)
    expect(result.current.video).toEqual(detail('storyboard').video)
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}`)
  })

  it.each(['drafting', 'queued', 'running'])('polls every 2 seconds while the video is %s', async status => {
    global.fetch = vi.fn().mockResolvedValue(respond(detail(status)))

    renderHook(() => useVideo('tok', VIDEO_ID, vi.fn()))
    await advance(0)
    await advance(1999)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await advance(1)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('stops polling when the storyboard is ready', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(detail('drafting')))
      .mockResolvedValue(respond(detail('storyboard')))

    const { result } = renderHook(() => useVideo('tok', VIDEO_ID, vi.fn()))
    await advance(0)
    await advance(2000)
    await advance(10000)

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.video.status).toBe('storyboard')
  })

  it('stops polling on unmount', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(detail('drafting')))

    const { unmount } = renderHook(() => useVideo('tok', VIDEO_ID, vi.fn()))
    await advance(0)
    unmount()
    await advance(10000)

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('resumes polling when an action hands back a video in progress', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(detail('storyboard')))

    const { result } = renderHook(() => useVideo('tok', VIDEO_ID, vi.fn()))
    await advance(0)
    act(() => result.current.replaceVideo(detail('drafting').video))
    expect(result.current.video.status).toBe('drafting')

    await advance(2000)

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.video.status).toBe('storyboard')
  })

  it('exposes the error for a missing video', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ error: 'Video not found.' }, 404))

    const { result } = renderHook(() => useVideo('tok', VIDEO_ID, vi.fn()))
    await advance(0)

    expect(result.current.video).toBeNull()
    expect(result.current.error).toBe('Video not found.')
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    renderHook(() => useVideo('tok', VIDEO_ID, onLogout))
    await advance(0)

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
