/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react'
import { useSessionRefresh } from '../hooks/useSessionRefresh/useSessionRefresh.js'
import { createFirstAdmin, signInWithGoogle, signInWithGoogleCode, signInWithPassword } from '../services/services.js'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
const GOOGLE_SIGN_IN_FAILED = 'Google sign-in failed. Please try again.'

const AuthContext = createContext(null)

export function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readStoredToken)
  const [user, setUser] = useState(loadUser)
  const [error, setError] = useState(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const storeSession = useCallback(session => {
    localStorage.setItem(TOKEN_KEY, session.token)
    localStorage.setItem(USER_KEY, JSON.stringify(session.user))
    setToken(session.token)
    setUser(session.user)
  }, [])

  const performLogin = useCallback(
    async signIn => {
      setError(null)
      setIsLoggingIn(true)

      try {
        storeSession(await signIn())
        return true
      } catch (err) {
        setError(err.message)
        return false
      } finally {
        setIsLoggingIn(false)
      }
    },
    [storeSession]
  )

  const performGoogleLogin = useCallback(
    async (grant, signIn) => {
      if (!grant) {
        setError(GOOGLE_SIGN_IN_FAILED)
        return false
      }

      return performLogin(() => signIn(grant))
    },
    [performLogin]
  )

  const loginWithGoogle = useCallback(
    credential => performGoogleLogin(credential, signInWithGoogle),
    [performGoogleLogin]
  )

  const loginWithGoogleCode = useCallback(code => performGoogleLogin(code, signInWithGoogleCode), [performGoogleLogin])

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

  useSessionRefresh(token, { onRefresh: storeSession, onExpire: logout })

  const value = {
    token,
    user,
    isAuthenticated: !!token,
    loginWithGoogle,
    loginWithGoogleCode,
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
