import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useAuthMethods } from '../hooks/useAuthMethods.js'
import Login from './Login.jsx'

// The /login route. Renders the sign-in methods enabled by the admin and,
// once authenticated, sends the user on to the chat. It never forces already
// signed-in visitors away from the landing page — that redirect only happens
// from here, after login.
export default function LoginPage() {
  const { isAuthenticated, loginWithGoogle, loginWithPassword, error, isLoggingIn } = useAuth()
  const methods = useAuthMethods()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat', { replace: true })
    }
  }, [isAuthenticated, navigate])

  return (
    <Login
      onLogin={methods?.google ? loginWithGoogle : undefined}
      onPasswordLogin={methods?.password ? loginWithPassword : undefined}
      error={error}
      isLoading={isLoggingIn || methods === null}
    />
  )
}
