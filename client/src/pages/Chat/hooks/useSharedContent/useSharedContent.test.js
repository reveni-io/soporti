import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSharedContent } from './useSharedContent.js'

function stubShareCache(payload) {
  const entries = {
    '/share-target/payload': payload && { json: async () => payload },
    '/share-target/files/0': { blob: async () => new Blob(['png-bytes'], { type: 'image/png' }) },
  }
  const storage = {
    match: vi.fn(async path => entries[path]),
    delete: vi.fn().mockResolvedValue(true),
  }
  vi.stubGlobal('caches', storage)

  return storage
}

const SHARED_PAYLOAD = {
  title: '',
  text: 'Why was this refund rejected?',
  url: '',
  files: [{ name: 'shot.png', type: 'image/png', path: '/share-target/files/0' }],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSharedContent', () => {
  it('hands over what was shared, drops the link and clears the stored share', async () => {
    const storage = stubShareCache(SHARED_PAYLOAD)
    const onShare = vi.fn()
    const onRead = vi.fn()

    renderHook(() => useSharedContent({ isShared: true, onShare, onRead }))

    await waitFor(() => expect(storage.delete).toHaveBeenCalledWith('soporti-share-target'))
    expect(onRead).toHaveBeenCalledTimes(1)
    expect(onShare).toHaveBeenCalledTimes(1)
    const [content] = onShare.mock.calls[0]
    expect(content.text).toBe('Why was this refund rejected?')
    expect(content.files.map(file => file.name)).toEqual(['shot.png'])
  })

  it('reads nothing without a share link', async () => {
    const storage = stubShareCache(SHARED_PAYLOAD)
    const onShare = vi.fn()
    const onRead = vi.fn()

    renderHook(() => useSharedContent({ isShared: false, onShare, onRead }))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(storage.match).not.toHaveBeenCalled()
    expect(onShare).not.toHaveBeenCalled()
    expect(onRead).not.toHaveBeenCalled()
  })

  it('drops the link when nothing was stored', async () => {
    stubShareCache(null)
    const onShare = vi.fn()
    const onRead = vi.fn()

    renderHook(() => useSharedContent({ isShared: true, onShare, onRead }))

    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1))
    expect(onShare).not.toHaveBeenCalled()
  })

  it('drops the link when the stored share cannot be read', async () => {
    const storage = stubShareCache(SHARED_PAYLOAD)
    storage.match.mockRejectedValue(new Error('Cache Storage is unavailable'))
    const onShare = vi.fn()
    const onRead = vi.fn()

    renderHook(() => useSharedContent({ isShared: true, onShare, onRead }))

    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1))
    expect(onShare).not.toHaveBeenCalled()
  })

  it('hands the share over once even when React runs the effect twice', async () => {
    const storage = stubShareCache(SHARED_PAYLOAD)
    const onShare = vi.fn()
    const onRead = vi.fn()

    renderHook(() => useSharedContent({ isShared: true, onShare, onRead }), { reactStrictMode: true })

    await waitFor(() => expect(storage.delete).toHaveBeenCalledTimes(1))
    expect(onShare).toHaveBeenCalledTimes(1)
  })
})
