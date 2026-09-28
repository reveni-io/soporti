import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useZendeskConnection } from './useZendeskConnection.js'

const DISCONNECTED = { connected: false, subdomain: null, email: null, writesEnabled: false }
const CONNECTED = { connected: true, subdomain: 'acme', email: 'ana@acme.com', writesEnabled: false }

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

let onLogout
let onConnectionsChange

beforeEach(() => {
  vi.restoreAllMocks()
  onLogout = vi.fn()
  onConnectionsChange = vi.fn()
})

describe('useZendeskConnection', () => {
  it('loads the connection of the signed-in user', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(CONNECTED))

    const { result } = renderHook(() => useZendeskConnection('tok', onLogout, onConnectionsChange))

    await waitFor(() => expect(result.current.connection).toEqual(CONNECTED))
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/user/zendesk')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('connects, adopts the returned state and tells the page its sources changed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
    const { result } = renderHook(() => useZendeskConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(DISCONNECTED))

    let saved
    await act(async () => {
      saved = await result.current.connect({ subdomain: 'acme', email: 'ana@acme.com', apiToken: 'secret' })
    })

    expect(saved).toBe(true)
    expect(result.current.connection).toEqual(CONNECTED)
    expect(onConnectionsChange).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[1]
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ subdomain: 'acme', email: 'ana@acme.com', apiToken: 'secret' })
  })

  it('saves the write toggle without refreshing the sources', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
      .mockResolvedValueOnce(jsonResponse({ ...CONNECTED, writesEnabled: true }))
    const { result } = renderHook(() => useZendeskConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(CONNECTED))

    await act(async () => {
      await result.current.saveWrites(true)
    })

    expect(result.current.connection).toMatchObject({ writesEnabled: true })
    expect(onConnectionsChange).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[1][0]).toContain('/api/user/zendesk/writes')
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ enabled: true })
  })

  it('disconnects with a DELETE and refreshes the sources', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
    const { result } = renderHook(() => useZendeskConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(CONNECTED))

    await act(async () => {
      await result.current.disconnect()
    })

    expect(result.current.connection).toEqual(DISCONNECTED)
    expect(global.fetch.mock.calls[1][1].method).toBe('DELETE')
    expect(onConnectionsChange).toHaveBeenCalledTimes(1)
  })

  it('keeps the state and exposes the reason when a save is rejected', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse({ error: 'That does not look like a Zendesk API token.' }, 400))
    const { result } = renderHook(() => useZendeskConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(DISCONNECTED))

    let saved
    await act(async () => {
      saved = await result.current.connect({ subdomain: 'acme', email: 'ana@acme.com', apiToken: 'x' })
    })

    expect(saved).toBe(false)
    expect(result.current.saveError).toBe('That does not look like a Zendesk API token.')
    expect(result.current.connection).toEqual(DISCONNECTED)
    expect(onConnectionsChange).not.toHaveBeenCalled()
  })

  it('logs the user out when the load returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    renderHook(() => useZendeskConnection('tok', onLogout, onConnectionsChange))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
  })
})
