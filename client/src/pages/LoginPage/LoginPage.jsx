import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'
import Login from '../../common/Login/Login.jsx'
import { ROUTES } from '../../router/constants.js'

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
      navigate(ROUTES.CHAT, { replace: true })
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
