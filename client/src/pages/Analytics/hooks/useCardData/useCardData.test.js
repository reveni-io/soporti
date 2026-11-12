import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCardData } from './useCardData.js'

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const DATA_URL = `/api/analytics/cards/${CARD_ID}/data`
const FRESH_DATA_URL = `${DATA_URL}?fresh=true`
const RESULT = {
  columns: [
    { name: 'week', kind: 'date' },
    { name: 'returns', kind: 'number' },
  ],
  rows: [{ week: '2026-08-03T00:00:00.000Z', returns: 42 }],
  truncated: false,
}
const READY_CARD = {
  id: CARD_ID,
  status: 'ready',
  sql: 'SELECT week, returns FROM weekly_returns',
  layout: { x: 0, y: 0, w: 6, h: 4 },
  updatedAt: '2026-11-12T10:00:00.000Z',
}

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })

  return { promise, resolve }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useCardData', () => {
  it('fetches the cached data of a ready card on its first load', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(RESULT))

    const { result } = renderHook(() => useCardData('tok', READY_CARD, { refreshKey: 0, onLogout: vi.fn() }))
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(DATA_URL)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it.each([
    ['generating', { ...READY_CARD, status: 'generating' }],
    ['failed', { ...READY_CARD, status: 'failed' }],
    ['ready without a query', { ...READY_CARD, sql: null }],
  ])('does not fetch for a card that is %s', async (_state, card) => {
    global.fetch = vi.fn().mockResolvedValue(respond(RESULT))

    const { result } = renderHook(() => useCardData('tok', card, { refreshKey: 0, onLogout: vi.fn() }))
    await act(async () => {})

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('does not take the refresh key it starts with for a refresh', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(RESULT))

    const { result } = renderHook(() => useCardData('tok', READY_CARD, { refreshKey: 7, onLogout: vi.fn() }))

    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(DATA_URL)
  })

  it('fetches once the card finishes generating', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(RESULT))

    const { result, rerender } = renderHook(
      ({ card }) => useCardData('tok', card, { refreshKey: 0, onLogout: vi.fn() }),
      { initialProps: { card: { ...READY_CARD, status: 'generating', sql: null } } }
    )
    rerender({ card: READY_CARD })

    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(DATA_URL)
  })

  it('loads the cached data of a card that became ready after the page was refreshed', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(RESULT))

    const { result, rerender } = renderHook(
      ({ card, refreshKey }) => useCardData('tok', card, { refreshKey, onLogout: vi.fn() }),
      { initialProps: { card: { ...READY_CARD, status: 'generating', sql: null }, refreshKey: 0 } }
    )
    rerender({ card: { ...READY_CARD, status: 'generating', sql: null }, refreshKey: 1 })
    rerender({ card: READY_CARD, refreshKey: 1 })

    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(DATA_URL)
  })

  it('does not fetch again when only the layout of the card changes', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(RESULT))

    const { result, rerender } = renderHook(
      ({ card }) => useCardData('tok', card, { refreshKey: 0, onLogout: vi.fn() }),
      { initialProps: { card: READY_CARD } }
    )
    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    rerender({
      card: { ...READY_CARD, layout: { x: 6, y: 2, w: 4, h: 3 }, updatedAt: '2026-11-12T11:00:00.000Z' },
    })
    await act(async () => {})

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(RESULT)
  })

  it('fetches the cached data again when the query of the card changes, dropping the rows of the old one', async () => {
    const monthly = { ...RESULT, columns: [{ name: 'month', kind: 'date' }], rows: [{ month: '2026-08-01' }] }
    const next = deferred()
    global.fetch = vi.fn().mockResolvedValueOnce(respond(RESULT)).mockReturnValueOnce(next.promise)

    const { result, rerender } = renderHook(
      ({ card }) => useCardData('tok', card, { refreshKey: 0, onLogout: vi.fn() }),
      { initialProps: { card: READY_CARD } }
    )
    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    rerender({ card: { ...READY_CARD, sql: 'SELECT month FROM monthly_returns' } })

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(true)

    await act(async () => next.resolve(respond(monthly)))
    expect(result.current.data).toEqual(monthly)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[1][0]).toBe(DATA_URL)
  })

  it('runs the query again when the page refresh key changes, keeping the data meanwhile', async () => {
    const fresh = { ...RESULT, rows: [{ week: '2026-08-10T00:00:00.000Z', returns: 50 }] }
    const next = deferred()
    global.fetch = vi.fn().mockResolvedValueOnce(respond(RESULT)).mockReturnValueOnce(next.promise)

    const { result, rerender } = renderHook(
      ({ refreshKey }) => useCardData('tok', READY_CARD, { refreshKey, onLogout: vi.fn() }),
      { initialProps: { refreshKey: 0 } }
    )
    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    rerender({ refreshKey: 1 })

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toEqual(RESULT)

    await act(async () => next.resolve(respond(fresh)))
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toEqual(fresh)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[0][0]).toBe(DATA_URL)
    expect(global.fetch.mock.calls[1][0]).toBe(FRESH_DATA_URL)
  })

  it('runs the query again when asked to refresh', async () => {
    const fresh = { ...RESULT, rows: [] }
    global.fetch = vi.fn().mockResolvedValueOnce(respond(RESULT)).mockResolvedValueOnce(respond(fresh))

    const { result } = renderHook(() => useCardData('tok', READY_CARD, { refreshKey: 0, onLogout: vi.fn() }))
    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.data).toEqual(fresh))
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[0][0]).toBe(DATA_URL)
    expect(global.fetch.mock.calls[1][0]).toBe(FRESH_DATA_URL)
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer tok')
  })

  it('goes back to the cached data when the query changes after a refresh', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(RESULT))

    const { result, rerender } = renderHook(
      ({ card }) => useCardData('tok', card, { refreshKey: 0, onLogout: vi.fn() }),
      { initialProps: { card: READY_CARD } }
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    act(() => result.current.refresh())
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    rerender({ card: { ...READY_CARD, sql: 'SELECT month FROM monthly_returns' } })

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([DATA_URL, FRESH_DATA_URL, DATA_URL])
  })

  it('surfaces the message of the database and clears the data when the query fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(RESULT))
      .mockResolvedValueOnce(respond({ error: 'relation "weekly_returns" does not exist' }, 422))

    const { result } = renderHook(() => useCardData('tok', READY_CARD, { refreshKey: 0, onLogout: vi.fn() }))
    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.error).toBe('relation "weekly_returns" does not exist'))
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('clears the error once the query works again', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ error: 'canceling statement due to statement timeout' }, 422))
      .mockResolvedValueOnce(respond(RESULT))

    const { result } = renderHook(() => useCardData('tok', READY_CARD, { refreshKey: 0, onLogout: vi.fn() }))
    await waitFor(() => expect(result.current.error).toBe('canceling statement due to statement timeout'))
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.data).toEqual(RESULT))
    expect(result.current.error).toBeNull()
  })

  it('logs out on a 401 without exposing an error', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useCardData('tok', READY_CARD, { refreshKey: 0, onLogout }))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('ignores a response that lands after unmount', async () => {
    const pending = deferred()
    global.fetch = vi.fn().mockReturnValue(pending.promise)
    const onLogout = vi.fn()

    const { result, unmount } = renderHook(() => useCardData('tok', READY_CARD, { refreshKey: 0, onLogout }))
    unmount()
    await act(async () => pending.resolve(respond({}, 401)))

    expect(onLogout).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })
})
