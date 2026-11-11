import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSessionRefresh } from './useSessionRefresh.js'

const HOUR_SECONDS = 60 * 60
const HOUR_MS = HOUR_SECONDS * 1000
const DAY_SECONDS = 24 * HOUR_SECONDS

function buildToken(claims) {
  return `header.${btoa(JSON.stringify(claims))}.signature`
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSessionRefresh', () => {
  it('trades a token past its half-life for a fresh session', async () => {
    const token = buildToken({ iat: nowSeconds() - 4 * DAY_SECONDS, exp: nowSeconds() + 3 * DAY_SECONDS })
    const session = { token: 'fresh-token', user: { email: 'jane@example.com', role: 'user' } }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => session })
    const onRefresh = vi.fn()
    const onExpire = vi.fn()

    renderHook(() => useSessionRefresh(token, { onRefresh, onExpire }))

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    expect(onRefresh).toHaveBeenCalledWith(session)
    expect(onExpire).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/auth/refresh')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe(`Bearer ${token}`)
  })

  it('leaves a token in the first half of its life alone', () => {
    const token = buildToken({ iat: nowSeconds() - HOUR_SECONDS, exp: nowSeconds() + 7 * DAY_SECONDS })
    global.fetch = vi.fn()

    renderHook(() => useSessionRefresh(token, { onRefresh: vi.fn(), onExpire: vi.fn() }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('ignores a token whose claims cannot be read', () => {
    global.fetch = vi.fn()

    renderHook(() => useSessionRefresh('not-a-jwt', { onRefresh: vi.fn(), onExpire: vi.fn() }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does nothing without a token', () => {
    global.fetch = vi.fn()

    renderHook(() => useSessionRefresh(null, { onRefresh: vi.fn(), onExpire: vi.fn() }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('ends the session when the server rejects the refresh', async () => {
    const token = buildToken({ iat: nowSeconds() - 6 * DAY_SECONDS, exp: nowSeconds() + DAY_SECONDS })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Expired.' }) })
    const onRefresh = vi.fn()
    const onExpire = vi.fn()

    renderHook(() => useSessionRefresh(token, { onRefresh, onExpire }))

    await waitFor(() => expect(onExpire).toHaveBeenCalledTimes(1))
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('keeps the session when the refresh fails for another reason', async () => {
    vi.useFakeTimers()
    const token = buildToken({ iat: nowSeconds() - 6 * DAY_SECONDS, exp: nowSeconds() + DAY_SECONDS })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const onRefresh = vi.fn()
    const onExpire = vi.fn()

    renderHook(() => useSessionRefresh(token, { onRefresh, onExpire }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(onRefresh).not.toHaveBeenCalled()
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('checks again every hour while the app stays open', async () => {
    vi.useFakeTimers()
    const token = buildToken({ iat: nowSeconds(), exp: nowSeconds() + 2 * HOUR_SECONDS })
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'fresh', user: {} }) })
    const onRefresh = vi.fn()

    renderHook(() => useSessionRefresh(token, { onRefresh, onExpire: vi.fn() }))
    expect(global.fetch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(HOUR_MS)
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(onRefresh).toHaveBeenCalledWith({ token: 'fresh', user: {} })
  })

  it('stops checking once unmounted', async () => {
    vi.useFakeTimers()
    const token = buildToken({ iat: nowSeconds(), exp: nowSeconds() + 2 * HOUR_SECONDS })
    global.fetch = vi.fn()

    const { unmount } = renderHook(() => useSessionRefresh(token, { onRefresh: vi.fn(), onExpire: vi.fn() }))
    unmount()
    await vi.advanceTimersByTimeAsync(2 * HOUR_MS)

    expect(global.fetch).not.toHaveBeenCalled()
  })
})
