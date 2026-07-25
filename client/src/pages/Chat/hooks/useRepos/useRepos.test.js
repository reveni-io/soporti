import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRepos } from './useRepos.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useRepos', () => {
  it('loads the repos with the auth header', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ repos: [{ fullName: 'org/app' }] }) })

    const { result } = renderHook(() => useRepos('tok', vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.repos).toEqual([{ fullName: 'org/app' }])
    expect(result.current.error).toBeNull()
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('exposes the error message when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const { result } = renderHook(() => useRepos('tok', vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Failed to fetch repos'))
    expect(result.current.loading).toBe(false)
    expect(result.current.repos).toEqual([])
  })

  it('logs out on a 401 without exposing an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useRepos('tok', onLogout))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('ignores a response that lands after unmount', async () => {
    let resolveFetch
    global.fetch = vi.fn().mockReturnValue(new Promise(resolve => (resolveFetch = resolve)))

    const { result, unmount } = renderHook(() => useRepos('tok', vi.fn()))
    unmount()
    resolveFetch({ ok: true, status: 200, json: async () => ({ repos: [{ fullName: 'late/repo' }] }) })

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(result.current.repos).toEqual([])
  })
})
