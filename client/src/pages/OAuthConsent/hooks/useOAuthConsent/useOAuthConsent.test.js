import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { useOAuthConsent } from './useOAuthConsent.js'

const logout = vi.fn()
vi.mock('../../../../hooks/useAuth/useAuth.js', () => ({
  useAuth: () => ({ token: 'session-token', logout }),
}))

const QUERY =
  '?client_id=cid&client_name=Claude%20Code&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb' +
  `&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256`

function atQuery(query) {
  return {
    wrapper: ({ children }) => createElement(MemoryRouter, { initialEntries: [`/oauth/consent${query}`] }, children),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true })
  global.fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ redirectTo: 'https://claude.ai/cb?code=c' }) })
})

describe('useOAuthConsent', () => {
  it('reads the client name and marks a complete request as valid', () => {
    const { result } = renderHook(() => useOAuthConsent(), atQuery(QUERY))

    expect(result.current.clientName).toBe('Claude Code')
    expect(result.current.isRequestValid).toBe(true)
    expect(result.current.isDeciding).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it.each(['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method'])(
    'marks the request invalid without %s',
    param => {
      const query = QUERY.split('&')
        .filter(entry => !entry.replace('?', '').startsWith(`${param}=`))
        .join('&')

      expect(renderHook(() => useOAuthConsent(), atQuery(query)).result.current.isRequestValid).toBe(false)
    }
  )

  it('omits the optional parameters the client never sent', async () => {
    const { result } = renderHook(() => useOAuthConsent(), atQuery(QUERY))

    await act(() => result.current.approve())

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      decision: 'allow',
      client_id: 'cid',
      redirect_uri: 'https://claude.ai/cb',
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
    })
  })

  it('clears a previous error before retrying', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Boom.' }) })
    const { result } = renderHook(() => useOAuthConsent(), atQuery(QUERY))

    await act(() => result.current.approve())
    expect(result.current.error).toBe('Boom.')

    await act(() => result.current.approve())
    await waitFor(() => expect(result.current.error).toBeNull())
  })

  it('logs out instead of surfacing an expired session', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Invalid token.' }) })
    const { result } = renderHook(() => useOAuthConsent(), atQuery(QUERY))

    await act(() => result.current.approve())

    expect(logout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    expect(window.location.href).toBe('')
  })
})
