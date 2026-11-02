import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useBlobUrl } from './useBlobUrl.js'
import { getVideoThumbnail } from '../../services/services.js'

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

function respondBlob(content) {
  return { ok: true, status: 200, blob: async () => new Blob([content]) }
}

function respondError(body, status) {
  return { ok: false, status, json: async () => body }
}

function loaderFor(version) {
  return () => getVideoThumbnail('tok', VIDEO_ID, version)
}

beforeEach(() => {
  vi.restoreAllMocks()
  let created = 0
  URL.createObjectURL = vi.fn(() => {
    created += 1
    return `blob:thumbnail-${created}`
  })
  URL.revokeObjectURL = vi.fn()
})

describe('useBlobUrl', () => {
  it('turns the fetched blob into an object url', async () => {
    global.fetch = vi.fn().mockResolvedValue(respondBlob('jpeg'))
    const load = loaderFor(1)

    const { result } = renderHook(() => useBlobUrl(load, vi.fn()))

    await waitFor(() => expect(result.current.url).toBe('blob:thumbnail-1'))
    expect(result.current.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/versions/1/thumbnail`)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('revokes the previous url when the loader changes and the last one on unmount', async () => {
    global.fetch = vi.fn().mockResolvedValue(respondBlob('jpeg'))

    const { result, rerender, unmount } = renderHook(({ load }) => useBlobUrl(load, vi.fn()), {
      initialProps: { load: loaderFor(1) },
    })
    await waitFor(() => expect(result.current.url).toBe('blob:thumbnail-1'))

    rerender({ load: loaderFor(2) })
    await waitFor(() => expect(result.current.url).toBe('blob:thumbnail-2'))
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumbnail-1')

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:thumbnail-2')
  })

  it('fetches nothing without a loader', () => {
    global.fetch = vi.fn()

    const { result } = renderHook(() => useBlobUrl(null, vi.fn()))

    expect(result.current.url).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reports why the file could not be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(respondError({ error: 'Thumbnail not found.' }, 404))
    const load = loaderFor(1)

    const { result } = renderHook(() => useBlobUrl(load, vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Thumbnail not found.'))
    expect(result.current.url).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('logs out when the session expired', async () => {
    global.fetch = vi.fn().mockResolvedValue(respondError({}, 401))
    const onLogout = vi.fn()
    const load = loaderFor(1)

    const { result } = renderHook(() => useBlobUrl(load, onLogout))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('ignores a blob that arrives after unmount', async () => {
    let resolveFetch
    global.fetch = vi.fn().mockReturnValue(new Promise(resolve => (resolveFetch = resolve)))
    const load = loaderFor(1)

    const { unmount } = renderHook(() => useBlobUrl(load, vi.fn()))
    unmount()
    resolveFetch(respondBlob('jpeg'))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
