import { useState } from 'react'
import { createAdminUser } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

const DEFAULT_ROLE = 'user'
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 72

export default function CreateUserForm({ token, onLogout, onCreated }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(DEFAULT_ROLE)
  const { saving: creating, error, save } = useSaveField(onLogout)

  function handleSubmit(event) {
    event.preventDefault()
    save(async () => {
      await createAdminUser(token, { email: email.trim(), password, name: name.trim() || undefined, role })

      setEmail('')
      setName('')
      setPassword('')
      setRole(DEFAULT_ROLE)
      await onCreated()
    })
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          disabled={creating}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Name (optional)"
          value={name}
          onChange={event => setName(event.target.value)}
          disabled={creating}
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
          disabled={creating}
          required
        />
        <select
          className="input admin__input--select"
          value={role}
          onChange={event => setRole(event.target.value)}
          disabled={creating}
          aria-label="Role"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button className="btn btn--primary" type="submit" disabled={creating || !email.trim() || !password}>
          {creating ? 'Creating...' : 'Create'}
        </button>
      </form>
    </>
  )
}
