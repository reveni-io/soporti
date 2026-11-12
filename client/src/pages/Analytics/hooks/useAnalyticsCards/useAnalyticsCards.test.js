import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnalyticsCards } from './useAnalyticsCards.js'

const POLL_INTERVAL_MS = 2000
const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const OTHER_DASHBOARD_ID = '7d2e1f0a-3b4c-4d5e-9f6a-7b8c9d0e1f2a'
const CARDS_ROUTE = `GET /api/analytics/dashboards/${DASHBOARD_ID}/cards`
const OTHER_CARDS_ROUTE = `GET /api/analytics/dashboards/${OTHER_DASHBOARD_ID}/cards`
const CREATE_ROUTE = `POST /api/analytics/dashboards/${DASHBOARD_ID}/cards`
const LAYOUT_ROUTE = `PUT /api/analytics/dashboards/${DASHBOARD_ID}/layout`
const DASHBOARD = { id: DASHBOARD_ID, name: 'Returns overview', shared: false, isOwner: true, ownerName: 'Ada' }
const OTHER_DASHBOARD = { id: OTHER_DASHBOARD_ID, name: 'Finance', shared: true, isOwner: false, ownerName: 'Grace' }

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function card(id, status = 'ready') {
  return { id, title: id, status, sql: 'SELECT 1', chart: null, layout: { x: 0, y: 0, w: 6, h: 4 } }
}

function loaded(cards, dashboard = DASHBOARD) {
  return respond({ dashboard, cards })
}

function mockApi(routes) {
  global.fetch = vi.fn().mockImplementation((url, options = {}) => {
    const response = routes[`${options.method ?? 'GET'} ${url}`]
    return Promise.resolve(response ?? respond({}, 404))
  })
}

function callsTo(route) {
  return global.fetch.mock.calls.filter(([url, options = {}]) => `${options.method ?? 'GET'} ${url}` === route)
}

function bodyOf(route) {
  return JSON.parse(callsTo(route)[0][1].body)
}

function advance(ms) {
  return act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAnalyticsCards', () => {
  it('loads the cards of the dashboard together with the dashboard itself', async () => {
    mockApi({ [CARDS_ROUTE]: loaded([card('a')]) })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    expect(result.current.loading).toBe(true)
    expect(result.current.cards).toEqual([])
    expect(result.current.dashboard).toBeNull()
    await advance(0)

    expect(result.current.loading).toBe(false)
    expect(result.current.dashboard).toEqual(DASHBOARD)
    expect(result.current.cards).toEqual([card('a')])
    expect(result.current.notFound).toBe(false)
    expect(result.current.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(callsTo(CARDS_ROUTE)).toHaveLength(1)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('flags a dashboard that does not exist or is not shared with the caller', async () => {
    mockApi({ [CARDS_ROUTE]: respond({ error: 'Dashboard not found.' }, 404) })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, onLogout))
    await advance(0)

    expect(result.current.notFound).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.dashboard).toBeNull()
    expect(result.current.cards).toEqual([])
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('exposes the error when the dashboard cannot be loaded', async () => {
    mockApi({ [CARDS_ROUTE]: respond({ error: 'Analytics is unavailable.' }, 500) })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)

    expect(result.current.error).toBe('Analytics is unavailable.')
    expect(result.current.loading).toBe(false)
    expect(result.current.notFound).toBe(false)
    expect(result.current.cards).toEqual([])
  })

  it('starts over when the dashboard changes, without showing the cards of the previous one', async () => {
    let resolveOther
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes(DASHBOARD_ID)) return Promise.resolve(loaded([card('a')]))

      return new Promise(resolve => {
        resolveOther = resolve
      })
    })

    const { result, rerender } = renderHook(({ id }) => useAnalyticsCards('tok', id, vi.fn()), {
      initialProps: { id: DASHBOARD_ID },
    })
    await advance(0)
    expect(result.current.cards).toEqual([card('a')])

    rerender({ id: OTHER_DASHBOARD_ID })

    expect(result.current.loading).toBe(true)
    expect(result.current.cards).toEqual([])
    expect(result.current.dashboard).toBeNull()

    await act(async () => resolveOther(loaded([card('z')], OTHER_DASHBOARD)))

    expect(result.current.loading).toBe(false)
    expect(result.current.dashboard).toEqual(OTHER_DASHBOARD)
    expect(result.current.cards).toEqual([card('z')])
    expect(callsTo(OTHER_CARDS_ROUTE)).toHaveLength(1)
  })

  it('does not carry the error of one dashboard over to the next', async () => {
    let resolveOther
    global.fetch = vi.fn().mockImplementation(url => {
      if (url.includes(DASHBOARD_ID)) return Promise.resolve(respond({ error: 'Analytics is unavailable.' }, 500))

      return new Promise(resolve => {
        resolveOther = resolve
      })
    })

    const { result, rerender } = renderHook(({ id }) => useAnalyticsCards('tok', id, vi.fn()), {
      initialProps: { id: DASHBOARD_ID },
    })
    await advance(0)
    expect(result.current.error).toBe('Analytics is unavailable.')

    rerender({ id: OTHER_DASHBOARD_ID })

    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)

    await act(async () => resolveOther(loaded([], OTHER_DASHBOARD)))
    expect(result.current.error).toBeNull()
  })

  it('appends the card it creates in the dashboard', async () => {
    mockApi({
      [CARDS_ROUTE]: loaded([card('a')]),
      [CREATE_ROUTE]: respond({ card: card('b', 'generating') }, 202),
    })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await act(() => result.current.create('Orders per week'))

    expect(result.current.cards).toEqual([card('a'), card('b', 'generating')])
    expect(callsTo(CREATE_ROUTE)).toHaveLength(1)
    expect(bodyOf(CREATE_ROUTE)).toEqual({ prompt: 'Orders per week' })
  })

  it('replaces the card it revises', async () => {
    mockApi({
      [CARDS_ROUTE]: loaded([card('a'), card('b')]),
      'POST /api/analytics/cards/a/revise': respond({ card: card('a', 'generating') }, 202),
    })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await act(() => result.current.revise('a', 'Make it monthly'))

    expect(result.current.cards).toEqual([card('a', 'generating'), card('b')])
    expect(bodyOf('POST /api/analytics/cards/a/revise')).toEqual({ prompt: 'Make it monthly' })
  })

  it('replaces the card it retries', async () => {
    mockApi({
      [CARDS_ROUTE]: loaded([card('a', 'failed')]),
      'POST /api/analytics/cards/a/retry': respond({ card: card('a', 'generating') }, 202),
    })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await act(() => result.current.retry('a'))

    expect(result.current.cards).toEqual([card('a', 'generating')])
    expect(callsTo('POST /api/analytics/cards/a/retry')).toHaveLength(1)
  })

  it('replaces the card it updates', async () => {
    const renamed = { ...card('a'), title: 'Renamed' }
    mockApi({
      [CARDS_ROUTE]: loaded([card('a')]),
      'PUT /api/analytics/cards/a': respond({ card: renamed }),
    })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await act(() => result.current.update('a', { title: 'Renamed' }))

    expect(result.current.cards).toEqual([renamed])
    expect(bodyOf('PUT /api/analytics/cards/a')).toEqual({ title: 'Renamed' })
  })

  it('drops the card it removes', async () => {
    mockApi({
      [CARDS_ROUTE]: loaded([card('a'), card('b')]),
      'DELETE /api/analytics/cards/a': respond({ ok: true }),
    })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await act(() => result.current.remove('a'))

    expect(result.current.cards).toEqual([card('b')])
    expect(callsTo('DELETE /api/analytics/cards/a')).toHaveLength(1)
  })

  it('does not add a card to a dashboard that was left while it was being created', async () => {
    let resolveCreation
    global.fetch = vi.fn().mockImplementation((url, options = {}) => {
      if (options.method === 'POST') {
        return new Promise(resolve => {
          resolveCreation = resolve
        })
      }

      return Promise.resolve(url.includes(DASHBOARD_ID) ? loaded([card('a')]) : loaded([card('z')], OTHER_DASHBOARD))
    })

    const { result, rerender } = renderHook(({ id }) => useAnalyticsCards('tok', id, vi.fn()), {
      initialProps: { id: DASHBOARD_ID },
    })
    await advance(0)
    let creation
    act(() => {
      creation = result.current.create('Orders per week')
    })
    rerender({ id: OTHER_DASHBOARD_ID })
    await advance(0)
    await act(async () => {
      resolveCreation(respond({ card: card('b', 'generating') }, 202))
      await creation
    })

    expect(result.current.cards).toEqual([card('z')])
  })

  it('does not poll while no card is generating', async () => {
    mockApi({ [CARDS_ROUTE]: loaded([card('a'), card('b', 'failed')]) })

    renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await advance(POLL_INTERVAL_MS * 5)

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('polls every 2 seconds while a card is generating and stops once it settles', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(loaded([card('a', 'generating')]))
      .mockResolvedValueOnce(loaded([card('a', 'generating')]))
      .mockResolvedValue(loaded([card('a')]))

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await advance(POLL_INTERVAL_MS - 1)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await advance(1)
    expect(global.fetch).toHaveBeenCalledTimes(2)

    await advance(POLL_INTERVAL_MS)
    expect(result.current.cards).toEqual([card('a')])

    await advance(POLL_INTERVAL_MS * 5)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('starts polling once a created card is generating', async () => {
    mockApi({
      [CARDS_ROUTE]: loaded([]),
      [CREATE_ROUTE]: respond({ card: card('b', 'generating') }, 202),
    })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await act(() => result.current.create('Orders per week'))
    await advance(POLL_INTERVAL_MS)

    expect(callsTo(CARDS_ROUTE)).toHaveLength(2)
  })

  it('keeps the cards and exposes the error when a poll fails, then recovers', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(loaded([card('a', 'generating')]))
      .mockResolvedValueOnce(respond({ error: 'Analytics is unavailable.' }, 500))
      .mockResolvedValue(loaded([card('a')]))

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await advance(POLL_INTERVAL_MS)

    expect(result.current.error).toBe('Analytics is unavailable.')
    expect(result.current.cards).toEqual([card('a', 'generating')])
    expect(result.current.loading).toBe(false)

    await advance(POLL_INTERVAL_MS)

    expect(result.current.error).toBeNull()
    expect(result.current.cards).toEqual([card('a')])
  })

  it('turns to not found when the dashboard stops being available during a poll', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(loaded([card('a', 'generating')]))
      .mockResolvedValue(respond({ error: 'Dashboard not found.' }, 404))

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await advance(POLL_INTERVAL_MS)
    await advance(POLL_INTERVAL_MS * 5)

    expect(result.current.notFound).toBe(true)
    expect(result.current.cards).toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('loads the cards again when a poll that was already in flight misses a change', async () => {
    let resolveStalePoll
    const stalePoll = new Promise(resolve => {
      resolveStalePoll = resolve
    })
    const listResponses = [
      Promise.resolve(loaded([card('a', 'generating')])),
      stalePoll,
      Promise.resolve(loaded([card('a'), card('b', 'generating')])),
    ]
    global.fetch = vi.fn().mockImplementation((url, options = {}) => {
      if (options.method === 'POST') return Promise.resolve(respond({ card: card('b', 'generating') }, 202))
      return listResponses.shift()
    })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await advance(POLL_INTERVAL_MS)
    await act(() => result.current.create('Orders per week'))
    resolveStalePoll(loaded([card('a')]))
    await advance(0)

    expect(result.current.cards).toEqual([card('a'), card('b', 'generating')])
    expect(callsTo(CARDS_ROUTE)).toHaveLength(3)
  })

  it('logs out when the cards are requested with an expired session', async () => {
    mockApi({ [CARDS_ROUTE]: respond({}, 401) })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, onLogout))
    await advance(0)

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    expect(result.current.notFound).toBe(false)
  })

  it.each([
    ['create', hook => hook.create('Orders per week'), CREATE_ROUTE],
    ['revise', hook => hook.revise('a', 'Make it monthly'), 'POST /api/analytics/cards/a/revise'],
    ['retry', hook => hook.retry('a'), 'POST /api/analytics/cards/a/retry'],
    ['update', hook => hook.update('a', { title: 'Renamed' }), 'PUT /api/analytics/cards/a'],
    ['remove', hook => hook.remove('a'), 'DELETE /api/analytics/cards/a'],
  ])('logs out quietly when %s hits an expired session', async (_name, perform, route) => {
    mockApi({ [CARDS_ROUTE]: loaded([card('a')]), [route]: respond({}, 401) })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, onLogout))
    await advance(0)
    await act(() => perform(result.current))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.cards).toEqual([card('a')])
  })

  it.each([
    ['create', hook => hook.create('Orders per week'), CREATE_ROUTE],
    ['revise', hook => hook.revise('a', 'Make it monthly'), 'POST /api/analytics/cards/a/revise'],
    ['retry', hook => hook.retry('a'), 'POST /api/analytics/cards/a/retry'],
    ['update', hook => hook.update('a', { sql: 'SELEC 1' }), 'PUT /api/analytics/cards/a'],
    ['remove', hook => hook.remove('a'), 'DELETE /api/analytics/cards/a'],
  ])('rejects with the message of the server when %s fails', async (_name, perform, route) => {
    mockApi({
      [CARDS_ROUTE]: loaded([card('a')]),
      [route]: respond({ error: 'syntax error at or near "SELEC".' }, 422),
    })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, onLogout))
    await advance(0)
    let failure = null
    await act(async () => {
      failure = await perform(result.current).catch(err => err)
    })

    expect(failure.message).toBe('syntax error at or near "SELEC".')
    expect(onLogout).not.toHaveBeenCalled()
    expect(result.current.cards).toEqual([card('a')])
  })

  it('saves the position and size of every card of the dashboard', async () => {
    mockApi({ [CARDS_ROUTE]: loaded([card('a'), card('b')]), [LAYOUT_ROUTE]: respond({ ok: true }) })

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, vi.fn()))
    await advance(0)
    await act(() =>
      result.current.saveLayout([
        { id: 'a', x: 0, y: 0, w: 6, h: 4, isResizing: false },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ])
    )

    expect(callsTo(LAYOUT_ROUTE)).toHaveLength(1)
    expect(bodyOf(LAYOUT_ROUTE)).toEqual({
      items: [
        { id: 'a', x: 0, y: 0, w: 6, h: 4 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ],
    })
  })

  it('swallows a layout that could not be saved', async () => {
    mockApi({
      [CARDS_ROUTE]: loaded([card('a')]),
      [LAYOUT_ROUTE]: respond({ error: 'Analytics is unavailable.' }, 500),
    })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, onLogout))
    await advance(0)
    let outcome = 'pending'
    await act(async () => {
      outcome = await result.current.saveLayout([{ id: 'a', x: 0, y: 0, w: 6, h: 4 }])
    })

    expect(outcome).toBeUndefined()
    expect(onLogout).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('logs out when the layout is saved with an expired session', async () => {
    mockApi({ [CARDS_ROUTE]: loaded([card('a')]), [LAYOUT_ROUTE]: respond({}, 401) })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsCards('tok', DASHBOARD_ID, onLogout))
    await advance(0)
    await act(() => result.current.saveLayout([{ id: 'a', x: 0, y: 0, w: 6, h: 4 }]))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
