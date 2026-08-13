import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'
import Login from '../../common/Login/Login.jsx'
import { useOAuthConsent } from './hooks/useOAuthConsent/useOAuthConsent.js'
import './OAuthConsent.css'

export default function OAuthConsent() {
  const { isAuthenticated, user, loginWithGoogle, loginWithPassword, error: loginError, isLoggingIn } = useAuth()
  const methods = useAuthMethods()
  const { clientName, isRequestValid, error, isDeciding, approve, deny } = useOAuthConsent()

  if (!isAuthenticated) {
    return (
      <Login
        onLogin={methods?.google ? loginWithGoogle : undefined}
        onPasswordLogin={methods?.password ? loginWithPassword : undefined}
        error={loginError}
        isLoading={isLoggingIn || methods === null}
      />
    )
  }

  if (!isRequestValid) {
    return (
      <div className="consent">
        <div className="consent__card card card--floating">
          <h1 className="consent__title">This request is incomplete</h1>
          <p className="alert alert--error">
            Some of the authorization parameters are missing. Start the connection again from your MCP client.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="consent">
      <div className="consent__card card card--floating">
        <h1 className="consent__title">Connect {clientName}</h1>
        <p className="consent__lead">
          It wants to ask Soporti questions as <strong>{user?.email}</strong>.
        </p>

        <ul className="consent__grants">
          <li>Ask and follow up on investigations under your name</li>
          <li>Reach every source your account can already reach</li>
          <li>Never read your password, and never sign in to anything else for you</li>
        </ul>

        {error && <p className="alert alert--error">{error}</p>}

        <div className="consent__actions">
          <button type="button" className="btn btn--secondary" onClick={deny} disabled={isDeciding}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={approve} disabled={isDeciding}>
            {isDeciding ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
