import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAuthedResource } from './useAuthedResource.js'

describe('useAuthedResource', () => {
  it('loads the keyed value with the token', async () => {
    const fetchResource = vi.fn().mockResolvedValue({ integrations: [{ id: 'notion' }] })

    const { result } = renderHook(() => useAuthedResource(fetchResource, 'integrations', 'tok', []))

    await waitFor(() => expect(result.current).toEqual([{ id: 'notion' }]))
    expect(fetchResource).toHaveBeenCalledWith('tok')
  })

  it('keeps the initial value without a token and never fetches', async () => {
    const fetchResource = vi.fn()

    const { result } = renderHook(() => useAuthedResource(fetchResource, 'integrations', null, []))

    expect(result.current).toEqual([])
    expect(fetchResource).not.toHaveBeenCalled()
  })

  it('keeps the initial value when the request fails', async () => {
    const fetchResource = vi.fn().mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useAuthedResource(fetchResource, 'integrations', 'tok', []))

    await waitFor(() => expect(fetchResource).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })

  it('refetches when the reload key changes', async () => {
    const fetchResource = vi
      .fn()
      .mockResolvedValueOnce({ integrations: [{ id: 'notion' }] })
      .mockResolvedValueOnce({ integrations: [{ id: 'notion' }, { id: 'granola' }] })

    const { result, rerender } = renderHook(
      ({ reloadKey }) => useAuthedResource(fetchResource, 'integrations', 'tok', [], reloadKey),
      { initialProps: { reloadKey: 0 } }
    )

    await waitFor(() => expect(result.current).toHaveLength(1))

    rerender({ reloadKey: 1 })

    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(fetchResource).toHaveBeenCalledTimes(2)
  })

  it('does not refetch while the reload key stays the same', async () => {
    const fetchResource = vi.fn().mockResolvedValue({ integrations: [{ id: 'notion' }] })

    const { rerender } = renderHook(
      ({ reloadKey }) => useAuthedResource(fetchResource, 'integrations', 'tok', [], reloadKey),
      { initialProps: { reloadKey: 0 } }
    )

    await waitFor(() => expect(fetchResource).toHaveBeenCalledTimes(1))

    rerender({ reloadKey: 0 })

    expect(fetchResource).toHaveBeenCalledTimes(1)
  })
})
