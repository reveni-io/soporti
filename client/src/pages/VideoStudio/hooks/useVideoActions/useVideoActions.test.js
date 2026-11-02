import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVideoActions } from './useVideoActions.js'

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const DRAFTING = { id: VIDEO_ID, status: 'drafting', stage: 'drafting' }

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useVideoActions', () => {
  it('sends a message and hands the updated video over', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ video: DRAFTING }, 202))
    const onVideo = vi.fn()

    const { result } = renderHook(() => useVideoActions({ token: 'tok', id: VIDEO_ID, onLogout: vi.fn(), onVideo }))
    let accepted
    await act(async () => {
      accepted = await result.current.sendMessage('Shorter intro')
    })

    expect(accepted).toBe(true)
    expect(onVideo).toHaveBeenCalledTimes(1)
    expect(onVideo).toHaveBeenCalledWith(DRAFTING)
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/messages`)
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ text: 'Shorter intro' })
  })

  it('asks for a new draft of the storyboard', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ video: DRAFTING }, 202))
    const onVideo = vi.fn()

    const { result } = renderHook(() => useVideoActions({ token: 'tok', id: VIDEO_ID, onLogout: vi.fn(), onVideo }))
    await act(() => result.current.redraft())

    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/storyboard`)
    expect(global.fetch.mock.calls[0][1].method).toBe('POST')
    expect(onVideo).toHaveBeenCalledWith(DRAFTING)
  })

  it('keeps the server reason when generation is refused', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ error: 'Generation is not available yet.' }, 409))
    const onVideo = vi.fn()

    const { result } = renderHook(() => useVideoActions({ token: 'tok', id: VIDEO_ID, onLogout: vi.fn(), onVideo }))
    await act(() => result.current.generate())

    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/generate`)
    expect(result.current.error).toBe('Generation is not available yet.')
    expect(onVideo).not.toHaveBeenCalled()
  })

  it('reports whether the video was deleted', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })

    const { result } = renderHook(() =>
      useVideoActions({ token: 'tok', id: VIDEO_ID, onLogout: vi.fn(), onVideo: vi.fn() })
    )
    let deleted
    await act(async () => {
      deleted = await result.current.remove()
    })

    expect(deleted).toBe(true)
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useVideoActions({ token: 'tok', id: VIDEO_ID, onLogout, onVideo: vi.fn() }))
    await act(() => result.current.generate())

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it.each([
    ['cancel', [], '/cancel'],
    ['retry', [2], '/versions/2/retry'],
    ['render', [1], '/versions/1/render'],
  ])('%s posts to the video and hands the updated video over', async (action, args, path) => {
    const queued = { id: VIDEO_ID, status: 'queued', stage: 'production' }
    global.fetch = vi.fn().mockResolvedValue(respond({ video: queued }, 202))
    const onVideo = vi.fn()

    const { result } = renderHook(() => useVideoActions({ token: 'tok', id: VIDEO_ID, onLogout: vi.fn(), onVideo }))
    await act(() => result.current[action](...args))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}${path}`)
    expect(global.fetch.mock.calls[0][1].method).toBe('POST')
    expect(onVideo).toHaveBeenCalledTimes(1)
    expect(onVideo).toHaveBeenCalledWith(queued)
  })

  it('creates a share link with the absolute api url and closes it', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ url: '/api/share/videos/abc123' }))

    const { result } = renderHook(() =>
      useVideoActions({ token: 'tok', id: VIDEO_ID, onLogout: vi.fn(), onVideo: vi.fn() })
    )
    await act(() => result.current.share(2))

    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/versions/2/share`)
    expect(result.current.shareUrl).toBe(`${window.location.origin}/api/share/videos/abc123`)

    act(() => result.current.closeShare())

    expect(result.current.shareUrl).toBeNull()
  })

  it('creates a variant and hands the new video over', async () => {
    const variant = { id: 'b1c2d3e4-5f60-4a71-8b92-c3d4e5f60718', status: 'queued', stage: 'production' }
    global.fetch = vi.fn().mockResolvedValue(respond({ video: variant }, 201))
    const onVariant = vi.fn()

    const { result } = renderHook(() =>
      useVideoActions({ token: 'tok', id: VIDEO_ID, onLogout: vi.fn(), onVideo: vi.fn(), onVariant })
    )
    let created
    await act(async () => {
      created = await result.current.createVariant('Brand it for Acme')
    })

    expect(created).toBe(true)
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/variants`)
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ request: 'Brand it for Acme' })
    expect(onVariant).toHaveBeenCalledTimes(1)
    expect(onVariant).toHaveBeenCalledWith(variant)
  })
})
