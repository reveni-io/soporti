/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react'
import { createFirstAdmin, signInWithGoogle, signInWithPassword } from '../services/services.js'

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

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(loadUser)
  const [error, setError] = useState(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const performLogin = useCallback(async signIn => {
    setError(null)
    setIsLoggingIn(true)

    try {
      const data = await signIn()

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
      return performLogin(() => signInWithGoogle(credential))
    },
    [performLogin]
  )

  const loginWithPassword = useCallback(
    (email, password) => performLogin(() => signInWithPassword(email, password)),
    [performLogin]
  )

  const bootstrapAdmin = useCallback(
    (email, password, name, setupCode) => performLogin(() => createFirstAdmin(email, password, name, setupCode)),
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
