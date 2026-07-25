import { useState } from 'react'
import AdminNotice from '../AdminNotice/AdminNotice.jsx'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 72

export default function BootstrapForm({ onBootstrap, error, isLoading }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [localError, setLocalError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setLocalError(null)
    if (password !== confirm) {
      setLocalError('Passwords do not match.')
      return
    }
    await onBootstrap(email.trim(), password, name.trim() || undefined, setupCode.trim())
  }

  const displayError = localError || error

  return (
    <AdminNotice title="Welcome to Soporti">
      <p className="admin__muted">No admin account exists yet. Create the first one to finish the setup.</p>

      {displayError && <p className="alert alert--error">{displayError}</p>}

      <form className="admin__form" onSubmit={handleSubmit}>
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
          type="text"
          placeholder="Name (optional)"
          autoComplete="name"
          value={name}
          onChange={event => setName(event.target.value)}
          disabled={isLoading}
        />
        <input
          className="input"
          type="password"
          placeholder={`Password (min. ${MIN_PASSWORD_LENGTH} characters)`}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          value={password}
          onChange={event => setPassword(event.target.value)}
          disabled={isLoading}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={event => setConfirm(event.target.value)}
          disabled={isLoading}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Setup code"
          autoComplete="off"
          value={setupCode}
          onChange={event => setSetupCode(event.target.value)}
          disabled={isLoading}
          required
        />
        <p className="admin__muted">The setup code was printed in the server logs at startup.</p>
        <button
          className="btn btn--primary"
          type="submit"
          disabled={isLoading || !email.trim() || !password || !confirm || !setupCode.trim()}
        >
          {isLoading ? 'Creating...' : 'Create admin account'}
        </button>
      </form>
    </AdminNotice>
  )
}
