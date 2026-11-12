import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAnalyticsDashboards } from './useAnalyticsDashboards.js'

const LIST_ROUTE = 'GET /api/analytics/dashboards'
const CREATE_ROUTE = 'POST /api/analytics/dashboards'
const MINE = { id: 'mine', name: 'My dashboard', shared: false, isOwner: true, ownerName: 'Ada' }
const SALES = { id: 'sales', name: 'Sales', shared: true, isOwner: true, ownerName: 'Ada' }
const FINANCE = { id: 'finance', name: 'Finance', shared: true, isOwner: false, ownerName: 'Grace' }

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
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

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useAnalyticsDashboards', () => {
  it('loads the dashboards and tells whether a database is configured', async () => {
    mockApi({ [LIST_ROUTE]: respond({ configured: true, dashboards: [MINE, FINANCE] }) })

    const { result } = renderHook(() => useAnalyticsDashboards('tok', vi.fn()))
    expect(result.current.loading).toBe(true)
    expect(result.current.dashboards).toEqual([])
    expect(result.current.configured).toBeNull()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dashboards).toEqual([MINE, FINANCE])
    expect(result.current.configured).toBe(true)
    expect(result.current.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('reports a missing database connection', async () => {
    mockApi({ [LIST_ROUTE]: respond({ configured: false, dashboards: [MINE] }) })

    const { result } = renderHook(() => useAnalyticsDashboards('tok', vi.fn()))

    await waitFor(() => expect(result.current.configured).toBe(false))
  })

  it('exposes the error when the dashboards cannot be loaded', async () => {
    mockApi({ [LIST_ROUTE]: respond({ error: 'Analytics is unavailable.' }, 500) })

    const { result } = renderHook(() => useAnalyticsDashboards('tok', vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Analytics is unavailable.'))
    expect(result.current.dashboards).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('logs out when the dashboards are requested with an expired session', async () => {
    mockApi({ [LIST_ROUTE]: respond({}, 401) })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsDashboards('tok', onLogout))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('creates a dashboard, lists it after the own ones and hands it back', async () => {
    const created = { id: 'ops', name: 'Operations', shared: false, isOwner: true, ownerName: 'Ada' }
    mockApi({
      [LIST_ROUTE]: respond({ configured: true, dashboards: [MINE, SALES, FINANCE] }),
      [CREATE_ROUTE]: respond({ dashboard: created }, 201),
    })

    const { result } = renderHook(() => useAnalyticsDashboards('tok', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let returned
    await act(async () => {
      returned = await result.current.create('Operations')
    })

    expect(returned).toEqual(created)
    expect(result.current.dashboards).toEqual([MINE, SALES, created, FINANCE])
    expect(callsTo(CREATE_ROUTE)).toHaveLength(1)
    expect(bodyOf(CREATE_ROUTE)).toEqual({ name: 'Operations' })
  })

  it('replaces the dashboard it updates and hands it back', async () => {
    const renamed = { ...MINE, name: 'Returns overview', shared: true }
    mockApi({
      [LIST_ROUTE]: respond({ configured: true, dashboards: [MINE, FINANCE] }),
      'PUT /api/analytics/dashboards/mine': respond({ dashboard: renamed }),
    })

    const { result } = renderHook(() => useAnalyticsDashboards('tok', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let returned
    await act(async () => {
      returned = await result.current.update('mine', { name: 'Returns overview', shared: true })
    })

    expect(returned).toEqual(renamed)
    expect(result.current.dashboards).toEqual([renamed, FINANCE])
    expect(bodyOf('PUT /api/analytics/dashboards/mine')).toEqual({ name: 'Returns overview', shared: true })
  })

  it('drops the dashboard it removes', async () => {
    mockApi({
      [LIST_ROUTE]: respond({ configured: true, dashboards: [MINE, SALES, FINANCE] }),
      'DELETE /api/analytics/dashboards/sales': respond({ ok: true }),
    })

    const { result } = renderHook(() => useAnalyticsDashboards('tok', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.remove('sales'))

    expect(result.current.dashboards).toEqual([MINE, FINANCE])
    expect(callsTo('DELETE /api/analytics/dashboards/sales')).toHaveLength(1)
    expect(callsTo(LIST_ROUTE)).toHaveLength(1)
  })

  it('asks the server for a fresh list when the last own dashboard is removed', async () => {
    const starter = { id: 'starter', name: 'My dashboard', shared: false, isOwner: true, ownerName: 'Ada' }
    global.fetch = vi.fn().mockImplementation((url, options = {}) => {
      if (options.method === 'DELETE') return Promise.resolve(respond({ ok: true }))

      const isFirstList = global.fetch.mock.calls.length === 1
      return Promise.resolve(
        respond({ configured: true, dashboards: isFirstList ? [MINE, FINANCE] : [starter, FINANCE] })
      )
    })

    const { result } = renderHook(() => useAnalyticsDashboards('tok', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.remove('mine'))

    expect(result.current.dashboards).toEqual([starter, FINANCE])
    expect(callsTo(LIST_ROUTE)).toHaveLength(2)
  })

  it.each([
    ['create', hook => hook.create('Operations'), CREATE_ROUTE],
    ['update', hook => hook.update('mine', { shared: true }), 'PUT /api/analytics/dashboards/mine'],
    ['remove', hook => hook.remove('mine'), 'DELETE /api/analytics/dashboards/mine'],
  ])('logs out quietly when %s hits an expired session', async (_name, perform, route) => {
    mockApi({
      [LIST_ROUTE]: respond({ configured: true, dashboards: [MINE, FINANCE] }),
      [route]: respond({}, 401),
    })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsDashboards('tok', onLogout))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let returned = 'pending'
    await act(async () => {
      returned = await perform(result.current)
    })

    expect(returned ?? null).toBeNull()
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.dashboards).toEqual([MINE, FINANCE])
  })

  it.each([
    [
      'create',
      { perform: hook => hook.create('Operations'), route: CREATE_ROUTE, message: 'You already have 20 dashboards.' },
    ],
    [
      'update',
      {
        perform: hook => hook.update('finance', { name: 'Mine now' }),
        route: 'PUT /api/analytics/dashboards/finance',
        message: 'Only the owner can change this dashboard.',
      },
    ],
    [
      'remove',
      {
        perform: hook => hook.remove('finance'),
        route: 'DELETE /api/analytics/dashboards/finance',
        message: 'Only the owner can delete this dashboard.',
      },
    ],
  ])('rejects with the message of the server when %s fails', async (_name, { perform, route, message }) => {
    mockApi({
      [LIST_ROUTE]: respond({ configured: true, dashboards: [MINE, FINANCE] }),
      [route]: respond({ error: message }, 422),
    })
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAnalyticsDashboards('tok', onLogout))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let failure = null
    await act(async () => {
      failure = await perform(result.current).catch(err => err)
    })

    expect(failure.message).toBe(message)
    expect(onLogout).not.toHaveBeenCalled()
    expect(result.current.dashboards).toEqual([MINE, FINANCE])
  })
})
