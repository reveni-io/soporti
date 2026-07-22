import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext.jsx'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('AuthContext', () => {
  it('starts unauthenticated when no token in storage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
  })

  it('starts authenticated when token exists in storage', () => {
    localStorage.setItem('auth_token', 'existing-token')
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('existing-token')
  })

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/inside <AuthProvider>/)
  })

  it('loginWithGoogle sets token and user on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'new-token', user: { email: 'jane@example.com', name: 'Jane', role: 'user' } }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.loginWithGoogle('google-credential')
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('new-token')
    expect(result.current.user).toEqual({ email: 'jane@example.com', name: 'Jane', role: 'user' })
    expect(localStorage.getItem('auth_token')).toBe('new-token')
  })

  it('loginWithGoogle posts the credential to /api/auth/google', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'tok', user: {} }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.loginWithGoogle('the-credential')
    })

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/auth/google')
    expect(JSON.parse(options.body)).toEqual({ credential: 'the-credential' })
  })

  it('loginWithGoogle sets error on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Only @example.com accounts are allowed.' }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.loginWithGoogle('google-credential')
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.error).toBe('Only @example.com accounts are allowed.')
  })

  it('loginWithGoogle sets an error without fetching when credential is missing', async () => {
    global.fetch = vi.fn()

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.loginWithGoogle(null)
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/Google sign-in failed/)
  })

  it('loginWithPassword posts email and password and stores the session', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'pw-token', user: { email: 'sam@example.com', role: 'user' } }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    let ok
    await act(async () => {
      ok = await result.current.loginWithPassword('sam@example.com', 'secret123')
    })

    expect(ok).toBe(true)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/auth/login')
    expect(JSON.parse(options.body)).toEqual({ email: 'sam@example.com', password: 'secret123' })
    expect(result.current.token).toBe('pw-token')
  })

  it('loginWithPassword surfaces the server error and returns false', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid email or password.' }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    let ok
    await act(async () => {
      ok = await result.current.loginWithPassword('sam@example.com', 'wrong')
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe('Invalid email or password.')
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('bootstrapAdmin posts to /api/admin/bootstrap and stores the session', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'admin-token', user: { email: 'boss@example.com', role: 'admin' } }),
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.bootstrapAdmin('boss@example.com', 'secret123', 'Boss', 'code-from-logs')
    })

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/bootstrap')
    expect(JSON.parse(options.body)).toEqual({
      email: 'boss@example.com',
      password: 'secret123',
      name: 'Boss',
      setupCode: 'code-from-logs',
    })
    expect(result.current.user.role).toBe('admin')
  })

  it('shares state across two consumers under the same provider', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'shared-token', user: { email: 'jane@example.com' } }),
    })

    const { result } = renderHook(() => ({ a: useAuth(), b: useAuth() }), { wrapper })

    await act(async () => {
      await result.current.a.loginWithGoogle('cred')
    })

    expect(result.current.b.token).toBe('shared-token')
    expect(result.current.b.isAuthenticated).toBe(true)
  })

  it('sets isLoggingIn while a login is in progress', async () => {
    let resolveFetch
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve
        })
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    let loginPromise
    act(() => {
      loginPromise = result.current.loginWithGoogle('google-credential')
    })

    expect(result.current.isLoggingIn).toBe(true)

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ token: 'tok', user: {} }),
      })
      await loginPromise
    })

    expect(result.current.isLoggingIn).toBe(false)
  })

  it('logout clears token and user', async () => {
    localStorage.setItem('auth_token', 'token')
    localStorage.setItem('auth_user', JSON.stringify({ email: 'jane@example.com' }))
    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.logout()
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(localStorage.getItem('auth_user')).toBeNull()
  })

  it('handles network errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.loginWithGoogle('google-credential')
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.isAuthenticated).toBe(false)
  })
})
