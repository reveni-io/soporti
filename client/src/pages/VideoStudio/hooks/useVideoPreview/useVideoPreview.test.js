import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useVideoPreview } from './useVideoPreview.js'

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useVideoPreview', () => {
  it('loads the preview bundle of the version', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ html: '<!doctype html><title>v2</title>' }))

    const { result } = renderHook(() =>
      useVideoPreview({ token: 'tok', videoId: VIDEO_ID, version: 2, onLogout: vi.fn() })
    )

    await waitFor(() => expect(result.current.html).toBe('<!doctype html><title>v2</title>'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/versions/2/preview`)
  })

  it('reports why the preview could not be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ error: 'The preview is not ready yet.' }, 409))

    const { result } = renderHook(() =>
      useVideoPreview({ token: 'tok', videoId: VIDEO_ID, version: 1, onLogout: vi.fn() })
    )

    await waitFor(() => expect(result.current.error).toBe('The preview is not ready yet.'))
    expect(result.current.html).toBeNull()
  })

  it('logs out when the session expired', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useVideoPreview({ token: 'tok', videoId: VIDEO_ID, version: 1, onLogout }))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('ignores an answer that arrives after unmount', async () => {
    let resolveFetch
    global.fetch = vi.fn().mockReturnValue(new Promise(resolve => (resolveFetch = resolve)))
    const onLogout = vi.fn()

    const { result, unmount } = renderHook(() =>
      useVideoPreview({ token: 'tok', videoId: VIDEO_ID, version: 1, onLogout })
    )
    unmount()
    resolveFetch(respond({}, 401))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(onLogout).not.toHaveBeenCalled()
    expect(result.current.html).toBeNull()
  })
})
