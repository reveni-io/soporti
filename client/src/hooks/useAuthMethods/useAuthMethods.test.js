import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAuthMethods } from './useAuthMethods.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useAuthMethods', () => {
  it('returns null while the request is in flight', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAuthMethods())
    expect(result.current).toBeNull()
  })

  it('fetches the methods from /api/auth/methods', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ google: true, password: true }),
    })

    const { result } = renderHook(() => useAuthMethods())

    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })
    expect(global.fetch.mock.calls[0][0]).toContain('/api/auth/methods')
  })

  it('returns the methods reported by the server', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ google: true, password: false }),
    })

    const { result } = renderHook(() => useAuthMethods())

    await waitFor(() => {
      expect(result.current).toEqual({ google: true, password: false })
    })
  })

  it('coerces missing fields to false', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useAuthMethods())

    await waitFor(() => {
      expect(result.current).toEqual({ google: false, password: false })
    })
  })

  it('falls back to both methods enabled when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })

    const { result } = renderHook(() => useAuthMethods())

    await waitFor(() => {
      expect(result.current).toEqual({ google: true, password: true })
    })
  })

  it('falls back to both methods enabled when the request throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useAuthMethods())

    await waitFor(() => {
      expect(result.current).toEqual({ google: true, password: true })
    })
  })
})
