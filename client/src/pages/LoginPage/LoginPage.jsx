import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'
import Login from '../../common/Login/Login.jsx'
import { ROUTES } from '../../router/constants.js'

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
