import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useConversations } from './useConversations.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockList(conversations) {
  return { ok: true, status: 200, json: async () => ({ conversations }) }
}

describe('useConversations', () => {
  it('loads the conversations', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockList([{ id: 'c1', title: 'Auth question' }]))

    const { result } = renderHook(() => useConversations('tok', 0))

    await waitFor(() => expect(result.current.conversations).toEqual([{ id: 'c1', title: 'Auth question' }]))
  })

  it('falls back to an empty list when the payload has none', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    const { result } = renderHook(() => useConversations('tok', 0))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(result.current.conversations).toEqual([])
  })

  it('swallows a failed load and stays empty', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useConversations('tok', 0))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(result.current.conversations).toEqual([])
  })

  it('drops a conversation from the list and deletes it on the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([{ id: 'c1' }, { id: 'c2' }]))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })

    const { result } = renderHook(() => useConversations('tok', 0))
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))

    await act(async () => {
      await result.current.remove('c1')
    })

    expect(result.current.conversations).toEqual([{ id: 'c2' }])
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/conversations/c1')
    expect(options.method).toBe('DELETE')
  })

  it('keeps the conversation hidden even if the delete request fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([{ id: 'c1' }]))
      .mockRejectedValueOnce(new Error('offline'))

    const { result } = renderHook(() => useConversations('tok', 0))
    await waitFor(() => expect(result.current.conversations).toHaveLength(1))

    await act(async () => {
      await result.current.remove('c1')
    })

    expect(result.current.conversations).toEqual([])
  })

  it('reloads when the reload key changes', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([{ id: 'c1' }]))
      .mockResolvedValueOnce(mockList([]))

    const { result, rerender } = renderHook(({ reloadKey }) => useConversations('tok', reloadKey), {
      initialProps: { reloadKey: 0 },
    })
    await waitFor(() => expect(result.current.conversations).toHaveLength(1))

    rerender({ reloadKey: 1 })

    await waitFor(() => expect(result.current.conversations).toEqual([]))
  })
})
