import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useConversations } from './useConversations.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockList(conversations) {
  return { ok: true, status: 200, json: async () => ({ conversations }) }
}

function searchCalls() {
  return global.fetch.mock.calls.filter(([url]) => url.includes('?q='))
}

function waitPastDebounce() {
  return new Promise(resolve => setTimeout(resolve, 400))
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
  it('prepends the active conversation while the server list does not know it yet', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockList([{ id: 'c1', title: 'Auth question' }]))

    const active = { id: 'c2', title: 'Why did the payout fail?', isStreaming: true }
    const { result } = renderHook(() => useConversations('tok', 0, [active]))

    await waitFor(() => expect(result.current.conversations).toHaveLength(2))
    expect(result.current.conversations).toEqual([active, { id: 'c1', title: 'Auth question' }])
  })

  it('prepends every active conversation the server list does not know yet', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockList([{ id: 'c1', title: 'Auth question' }]))

    const active = [
      { id: 'c3', title: 'How does auth work?', isStreaming: true },
      { id: 'c2', title: 'Why did the payout fail?', isStreaming: true },
    ]
    const { result } = renderHook(() => useConversations('tok', 0, active))

    await waitFor(() => expect(result.current.conversations).toHaveLength(3))
    expect(result.current.conversations).toEqual([...active, { id: 'c1', title: 'Auth question' }])
  })

  it('marks each streaming conversation the server list already knows', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockList([
        { id: 'c1', title: 'Auth question' },
        { id: 'c2', title: 'Payout failure' },
        { id: 'c3', title: 'Refund report' },
      ])
    )

    const active = [
      { id: 'c3', title: 'Refund report', isStreaming: true },
      { id: 'c1', title: 'Auth question', isStreaming: false },
    ]
    const { result } = renderHook(() => useConversations('tok', 0, active))

    await waitFor(() => expect(result.current.conversations).toHaveLength(3))
    expect(result.current.conversations).toEqual([
      { id: 'c1', title: 'Auth question', isStreaming: false },
      { id: 'c2', title: 'Payout failure' },
      { id: 'c3', title: 'Refund report', isStreaming: true },
    ])
  })

  it('keeps the server entry and marks it as streaming once the list knows it', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockList([
        { id: 'c1', title: 'Auth question' },
        { id: 'c2', title: 'Payout failure', scheduleId: null },
      ])
    )

    const active = { id: 'c2', title: 'Why did the payout fail?', isStreaming: true }
    const { result } = renderHook(() => useConversations('tok', 0, [active]))

    await waitFor(() => expect(result.current.conversations).toHaveLength(2))
    expect(result.current.conversations).toEqual([
      { id: 'c1', title: 'Auth question' },
      { id: 'c2', title: 'Payout failure', scheduleId: null, isStreaming: true },
    ])
  })

  it('never brings back a conversation the reader deleted', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([{ id: 'c1', title: 'Auth question' }]))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })

    const active = [{ id: 'c1', title: 'Auth question', isStreaming: false }]
    const { result } = renderHook(() => useConversations('tok', 0, active))
    await waitFor(() => expect(result.current.conversations).toHaveLength(1))

    await act(async () => {
      await result.current.remove('c1')
    })

    expect(result.current.conversations).toEqual([])
  })

  it('leaves the list untouched when there is no active conversation', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockList([{ id: 'c1', title: 'Auth question' }]))

    const { result } = renderHook(() => useConversations('tok', 0))

    await waitFor(() => expect(result.current.conversations).toEqual([{ id: 'c1', title: 'Auth question' }]))
  })

  it('replaces the optimistic entry with the server one when the list refetches', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([]))
      .mockResolvedValueOnce(mockList([{ id: 'c2', title: 'Why did the payout fail?', scheduleId: null }]))

    const active = { id: 'c2', title: 'Why did the payout fail?', isStreaming: false }
    const { result, rerender } = renderHook(({ reloadKey }) => useConversations('tok', reloadKey, [active]), {
      initialProps: { reloadKey: 0 },
    })
    await waitFor(() => expect(result.current.conversations).toEqual([active]))

    rerender({ reloadKey: 1 })

    await waitFor(() =>
      expect(result.current.conversations).toEqual([
        { id: 'c2', title: 'Why did the payout fail?', scheduleId: null, isStreaming: false },
      ])
    )
  })

  it('searches once the query settles and exposes the query the results answer', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([{ id: 'c1', title: 'Auth question' }]))
      .mockResolvedValueOnce(mockList([{ id: 'c2', title: 'Vague title', snippet: 'the refund window' }]))

    const { result } = renderHook(() => useConversations('tok', 0))
    await waitFor(() => expect(result.current.conversations).toHaveLength(1))

    act(() => result.current.setQuery('r'))
    act(() => result.current.setQuery('ref'))
    act(() => result.current.setQuery('  refund  '))

    await waitFor(() => expect(result.current.searchedQuery).toBe('refund'))
    expect(result.current.query).toBe('  refund  ')
    expect(result.current.conversations).toEqual([{ id: 'c2', title: 'Vague title', snippet: 'the refund window' }])
    expect(searchCalls()).toHaveLength(1)
    expect(searchCalls()[0][0]).toBe('/api/conversations?q=refund')
  })

  it('does not search a blank query', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockList([{ id: 'c1', title: 'Auth question' }]))

    const { result } = renderHook(() => useConversations('tok', 0))
    await waitFor(() => expect(result.current.conversations).toHaveLength(1))

    act(() => result.current.setQuery('   '))
    await act(waitPastDebounce)

    expect(searchCalls()).toHaveLength(0)
    expect(result.current.searchedQuery).toBe('')
    expect(result.current.conversations).toEqual([{ id: 'c1', title: 'Auth question' }])
  })

  it('leaves out in-flight conversations the search did not return, but still marks the ones it did', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([{ id: 'c1', title: 'Refund report' }]))
      .mockResolvedValueOnce(mockList([{ id: 'c1', title: 'Refund report' }]))

    const active = [
      { id: 'c1', title: 'Refund report', isStreaming: true },
      { id: 'c9', title: 'Why did the payout fail?', isStreaming: true },
    ]
    const { result } = renderHook(() => useConversations('tok', 0, active))
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))

    act(() => result.current.setQuery('refund'))

    await waitFor(() => expect(result.current.searchedQuery).toBe('refund'))
    expect(result.current.conversations).toEqual([{ id: 'c1', title: 'Refund report', isStreaming: true }])
  })

  it('restores the regular list, in-flight conversations included, when the query is cleared', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([{ id: 'c1', title: 'Auth question' }]))
      .mockResolvedValueOnce(mockList([]))
      .mockResolvedValueOnce(mockList([{ id: 'c1', title: 'Auth question' }]))

    const active = [{ id: 'c9', title: 'Why did the payout fail?', isStreaming: true }]
    const { result } = renderHook(() => useConversations('tok', 0, active))
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))

    act(() => result.current.setQuery('nothing'))
    await waitFor(() => expect(result.current.searchedQuery).toBe('nothing'))
    expect(result.current.conversations).toEqual([])

    act(() => result.current.setQuery(''))

    await waitFor(() => expect(result.current.searchedQuery).toBe(''))
    expect(result.current.conversations).toEqual([...active, { id: 'c1', title: 'Auth question' }])
    expect(global.fetch.mock.calls[2][0]).toBe('/api/conversations')
  })

  it('drops a deleted conversation from the search results', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([]))
      .mockResolvedValueOnce(mockList([{ id: 'c1' }, { id: 'c2' }]))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })

    const { result } = renderHook(() => useConversations('tok', 0))
    act(() => result.current.setQuery('refund'))
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))

    await act(async () => {
      await result.current.remove('c1')
    })

    expect(result.current.conversations).toEqual([{ id: 'c2' }])
    expect(result.current.searchedQuery).toBe('refund')
  })
})
