/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

const AuthContext = createContext(null)

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null
  } catch {
    return null
  }
}

// Auth state shared across routes. With client-side routing there is no
// full-page reload after login, so the per-hook state the old useAuth had
// would desync between components — the provider is the single owner now.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(loadUser)
  const [error, setError] = useState(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Shared by every login flavor: POST credentials, store the session.
  // Returns true on success so callers can react without watching state.
  const performLogin = useCallback(async (path, body) => {
    setError(null)
    setIsLoggingIn(true)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Login failed')
      }

      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      setToken(data.token)
      setUser(data.user)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setIsLoggingIn(false)
    }
  }, [])

  const loginWithGoogle = useCallback(
    async credential => {
      if (!credential) {
        setError('Google sign-in failed. Please try again.')
        return false
      }
      return performLogin('/api/auth/google', { credential })
    },
    [performLogin]
  )

  const loginWithPassword = useCallback(
    (email, password) => performLogin('/api/auth/login', { email, password }),
    [performLogin]
  )

  // First-run only: creates the admin account and logs straight into it. The
  // setup code is printed in the server logs at startup.
  const bootstrapAdmin = useCallback(
    (email, password, name, setupCode) => performLogin('/api/admin/bootstrap', { email, password, name, setupCode }),
    [performLogin]
  )

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const value = {
    token,
    user,
    isAuthenticated: !!token,
    loginWithGoogle,
    loginWithPassword,
    bootstrapAdmin,
    logout,
    error,
    isLoggingIn,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
