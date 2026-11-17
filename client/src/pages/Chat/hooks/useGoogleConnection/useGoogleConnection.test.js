import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useGoogleConnection } from './useGoogleConnection.js'

const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly']
const DISCONNECTED = { available: true, connected: false, email: null, gmail: false, calendar: false, scopes: SCOPES }
const CONNECTED = {
  available: true,
  connected: true,
  email: 'ana@acme.com',
  gmail: true,
  calendar: true,
  scopes: SCOPES,
}

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

describe('useGoogleConnection', () => {
  it('loads the connection of the signed-in user', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(CONNECTED))

    const { result } = renderHook(() => useGoogleConnection('tok', onLogout, onConnectionsChange))

    await waitFor(() => expect(result.current.connection).toEqual(CONNECTED))
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/user/google')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('posts the authorization code, adopts the returned state and refreshes the sources', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
    const { result } = renderHook(() => useGoogleConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(DISCONNECTED))

    let saved
    await act(async () => {
      saved = await result.current.connect('the-code')
    })

    expect(saved).toBe(true)
    expect(result.current.connection).toEqual(CONNECTED)
    expect(onConnectionsChange).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/user/google')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ code: 'the-code' })
  })

  it('reports a refused grant without calling the server', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(DISCONNECTED))
    const { result } = renderHook(() => useGoogleConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(DISCONNECTED))

    let saved
    await act(async () => {
      saved = await result.current.connect(null)
    })

    expect(saved).toBe(false)
    expect(result.current.saveError).toMatch(/Google did not grant access/)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(onConnectionsChange).not.toHaveBeenCalled()
  })

  it('disconnects with a DELETE and refreshes the sources', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(CONNECTED))
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
    const { result } = renderHook(() => useGoogleConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(CONNECTED))

    await act(async () => {
      await result.current.disconnect()
    })

    expect(result.current.connection).toEqual(DISCONNECTED)
    expect(onConnectionsChange).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[1][1].method).toBe('DELETE')
  })

  it('keeps the state and surfaces the reason when the server rejects the code', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DISCONNECTED))
      .mockResolvedValueOnce(jsonResponse({ error: 'Google did not return access to Gmail or Calendar.' }, 422))
    const { result } = renderHook(() => useGoogleConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(DISCONNECTED))

    await act(async () => {
      await result.current.connect('the-code')
    })

    expect(result.current.connection).toEqual(DISCONNECTED)
    expect(result.current.saveError).toBe('Google did not return access to Gmail or Calendar.')
    expect(onConnectionsChange).not.toHaveBeenCalled()
  })

  it('logs out when saving returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonResponse(CONNECTED)).mockResolvedValueOnce(jsonResponse({}, 401))
    const { result } = renderHook(() => useGoogleConnection('tok', onLogout, onConnectionsChange))
    await waitFor(() => expect(result.current.connection).toEqual(CONNECTED))

    await act(async () => {
      await result.current.disconnect()
    })

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.saveError).toBeNull()
  })
})
