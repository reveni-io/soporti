import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSendcloudAccounts } from './useSendcloudAccounts.js'

const ACCOUNT = { id: 1, name: 'Acme EU', createdAt: '2026-10-01T10:00:00.000Z' }

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useSendcloudAccounts', () => {
  it('loads the linked accounts with the token', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ accounts: [ACCOUNT] }))

    const onLogout = vi.fn()

    const { result } = renderHook(() => useSendcloudAccounts('tok', onLogout))

    await waitFor(() => expect(result.current.accounts).toEqual([ACCOUNT]))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('fetches again on reload', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [ACCOUNT] }))

    const onLogout = vi.fn()

    const { result } = renderHook(() => useSendcloudAccounts('tok', onLogout))
    await waitFor(() => expect(result.current.accounts).toEqual([]))

    act(() => result.current.reload())

    await waitFor(() => expect(result.current.accounts).toEqual([ACCOUNT]))
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('reports the error message', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Database down.' }, 500))

    const onLogout = vi.fn()

    const { result } = renderHook(() => useSendcloudAccounts('tok', onLogout))

    await waitFor(() => expect(result.current.error).toBe('Database down.'))
    expect(result.current.accounts).toBeNull()
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useSendcloudAccounts('expired', onLogout))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('ignores a response that arrives after unmount', async () => {
    let resolveFetch
    global.fetch = vi.fn().mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve
      })
    )

    const onLogout = vi.fn()

    const { result, unmount } = renderHook(() => useSendcloudAccounts('tok', onLogout))
    unmount()
    await act(async () => resolveFetch(jsonResponse({ accounts: [ACCOUNT] })))

    expect(result.current.accounts).toBeNull()
  })
})
