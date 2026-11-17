import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import GoogleAccessButton from '../GoogleAccessButton/GoogleAccessButton.jsx'
import GridPattern from '../GridPattern/GridPattern.jsx'
import './Login.css'

const GOOGLE_SIGN_IN_LABEL = 'Sign in with Google'

export default function Login({ onLogin, onGoogleCode, googleScopes, onPasswordLogin, error, isLoading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (!email.trim() || !password) return
    onPasswordLogin(email.trim(), password)
  }

  return (
    <div className="login">
      <GridPattern />
      <div className="login__form card card--floating">
        <h1 className="login__title">Soporti</h1>
        <p className="login__subtitle">Your AI teammate for code, data & docs</p>

        {error && <p className="alert alert--error login__error">{error}</p>}

        {!onLogin && !onPasswordLogin && !isLoading && (
          <p className="login__subtitle">Sign-in is currently disabled. Contact an administrator.</p>
        )}

        {onLogin && (
          <div className="login__google">
            <GoogleSignIn scopes={googleScopes} isLoading={isLoading} onLogin={onLogin} onCode={onGoogleCode} />
          </div>
        )}

        {onPasswordLogin && (
          <>
            {onLogin && (
              <div className="login__divider">
                <span>or</span>
              </div>
            )}

            <form className="login__password" onSubmit={handleSubmit}>
              <input
                className="input"
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                disabled={isLoading}
                required
              />
              <input
                className="input"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                disabled={isLoading}
                required
              />
              <button className="btn btn--primary" type="submit" disabled={isLoading || !email.trim() || !password}>
                Sign in
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function GoogleSignIn({ scopes, isLoading, onLogin, onCode }) {
  if (isLoading) return <p className="login__subtitle">Logging in...</p>

  if (!scopes) {
    return (
      <GoogleLogin
        onSuccess={response => onLogin(response.credential)}
        onError={() => onLogin(null)}
        theme="filled_blue"
        shape="pill"
        text="signin_with"
      />
    )
  }

  return (
    <>
      <GoogleAccessButton
        scopes={scopes}
        label={GOOGLE_SIGN_IN_LABEL}
        selectAccount
        onCode={onCode}
        onError={() => onCode(null)}
      />
      <p className="login__note">Soporti will ask to read your Gmail and Calendar.</p>
    </>
  )
}
