import Login from '../Login/Login.jsx'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'

export default function AuthGate({ children }) {
  const { isAuthenticated, loginWithGoogle, loginWithPassword, error, isLoggingIn } = useAuth()
  const authMethods = useAuthMethods()

  if (isAuthenticated) return children

  return (
    <Login
      onLogin={authMethods?.google ? loginWithGoogle : undefined}
      onPasswordLogin={authMethods?.password ? loginWithPassword : undefined}
      error={error}
      isLoading={isLoggingIn || authMethods === null}
    />
  )
}
