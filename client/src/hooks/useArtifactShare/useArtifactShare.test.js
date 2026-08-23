import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useArtifactShare } from './useArtifactShare.js'

const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockShare() {
  return vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ shareId: 'abc', version: 2, url: '/a/abc' }) })
}

describe('useArtifactShare', () => {
  it('mints a share link and exposes it as an absolute url', async () => {
    global.fetch = mockShare()

    const { result } = renderHook(() => useArtifactShare('tok', vi.fn()))

    act(() => {
      result.current.share(ARTIFACT_ID, 2)
    })

    await waitFor(() => expect(result.current.shareUrl).toMatch(/\/a\/abc$/))
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain(`/api/artifacts/${ARTIFACT_ID}/share`)
    expect(JSON.parse(options.body)).toEqual({ version: 2 })
  })

  it('lets the server pick the version when none is given', async () => {
    global.fetch = mockShare()

    const { result } = renderHook(() => useArtifactShare('tok', vi.fn()))

    act(() => {
      result.current.share(ARTIFACT_ID)
    })

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ version: null })
  })

  it('dismisses the link', async () => {
    global.fetch = mockShare()

    const { result } = renderHook(() => useArtifactShare('tok', vi.fn()))

    act(() => {
      result.current.share(ARTIFACT_ID, 2)
    })
    await waitFor(() => expect(result.current.shareUrl).not.toBeNull())

    act(() => result.current.dismiss())

    expect(result.current.shareUrl).toBeNull()
  })

  it('logs the user out on a 401 instead of showing an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onAuthError = vi.fn()

    const { result } = renderHook(() => useArtifactShare('tok', onAuthError))

    act(() => {
      result.current.share(ARTIFACT_ID, 2)
    })

    await waitFor(() => expect(onAuthError).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
    expect(result.current.shareUrl).toBeNull()
  })

  it('surfaces a share failure', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed to share the artifact.' }) })

    const { result } = renderHook(() => useArtifactShare('tok', vi.fn()))

    act(() => {
      result.current.share(ARTIFACT_ID, 2)
    })

    await waitFor(() => expect(result.current.error).toBe('Failed to share the artifact.'))
  })

  it('clears a previous error on the next attempt', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Failed.' }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ shareId: 'abc', version: 2, url: '/a/abc' }) })

    const { result } = renderHook(() => useArtifactShare('tok', vi.fn()))

    act(() => {
      result.current.share(ARTIFACT_ID, 2)
    })
    await waitFor(() => expect(result.current.error).toBe('Failed.'))

    act(() => {
      result.current.share(ARTIFACT_ID, 2)
    })
    await waitFor(() => expect(result.current.error).toBeNull())
  })
})
