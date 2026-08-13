import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAttachmentImage } from './useAttachmentImage.js'

const IMAGE_ID = '22222222-2222-4222-8222-222222222222'
const DATA_URI = 'data:image/png;base64,AQID'

describe('useAttachmentImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the image of the given id', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ image: DATA_URI }) })

    const { result } = renderHook(() => useAttachmentImage('token', IMAGE_ID))

    await waitFor(() => expect(result.current.image).toBe(DATA_URI))
    expect(result.current.expired).toBe(false)
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/attachments/images/${IMAGE_ID}`,
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    )
  })

  it('reports the image as expired when it is gone', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Not found.' }) })

    const { result } = renderHook(() => useAttachmentImage('token', IMAGE_ID))

    await waitFor(() => expect(result.current.expired).toBe(true))
    expect(result.current.image).toBeNull()
  })

  it('does not fetch without a token or without an id', () => {
    global.fetch = vi.fn()

    renderHook(() => useAttachmentImage('', IMAGE_ID))
    renderHook(() => useAttachmentImage('token', null))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reloads when the id changes', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ image: DATA_URI }) })

    const { result, rerender } = renderHook(({ id }) => useAttachmentImage('token', id), {
      initialProps: { id: IMAGE_ID },
    })
    await waitFor(() => expect(result.current.image).toBe(DATA_URI))

    const other = '33333333-3333-4333-8333-333333333333'
    rerender({ id: other })

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(global.fetch.mock.calls[1][0]).toBe(`/api/attachments/images/${other}`)
  })
})
