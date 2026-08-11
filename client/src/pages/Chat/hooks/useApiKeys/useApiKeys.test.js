import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useApiKeys } from './useApiKeys.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockList(apiKeys = []) {
  return { ok: true, status: 200, json: async () => ({ apiKeys }) }
}

describe('useApiKeys', () => {
  it('loads the keys with the auth header', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockList([{ id: 1, name: 'mcp', prefix: 'sop_abcd1234' }]))

    const { result } = renderHook(() => useApiKeys('tok', vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.apiKeys).toEqual([{ id: 1, name: 'mcp', prefix: 'sop_abcd1234' }])
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/api-keys')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('does not fetch without a token', () => {
    global.fetch = vi.fn()

    renderHook(() => useApiKeys(null, vi.fn()))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls onUnauthorized on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onUnauthorized = vi.fn()

    renderHook(() => useApiKeys('tok', onUnauthorized))

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
  })

  it('exposes an error when the load fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const { result } = renderHook(() => useApiKeys('tok', vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Failed to load the API keys'))
  })

  it('refetches on reload', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([]))
      .mockResolvedValueOnce(mockList([{ id: 2, name: 'ci' }]))

    const { result } = renderHook(() => useApiKeys('tok', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.apiKeys).toEqual([{ id: 2, name: 'ci' }])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
