import { useEffect, useState, useCallback } from 'react'

export default function AdminUsers({ token, onLogout }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      if (!res.ok) throw new Error('Failed to load users')
      const data = await res.json()
      setUsers(data.users)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, onLogout])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate(event) {
    event.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined, role }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create the user')

      setEmail('')
      setName('')
      setPassword('')
      setRole('user')
      await load()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function formatDate(value) {
    if (!value) return '—'
    const date = new Date(value)
    return isNaN(date) ? '—' : date.toLocaleDateString()
  }

  return (
    <section className="admin__section card">
      <h2 className="admin__section-title">Users</h2>
      <p className="admin__muted">
        Users sign in with Google (allowed domains below) or with an email and password created here.
      </p>

      {error && <p className="alert alert--error">{error}</p>}

      {loading ? (
        <p className="admin__muted">Loading...</p>
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Sign-in methods</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.email || '—'}</td>
                  <td>{user.name || user.slackId || '—'}</td>
                  <td>
                    <span className={`badge ${user.role === 'admin' ? 'badge--success' : ''}`}>{user.role}</span>
                  </td>
                  <td>
                    <span className="admin__methods">
                      {user.hasGoogle && <span className="badge">google</span>}
                      {user.hasPassword && <span className="badge">password</span>}
                      {user.hasSlack && <span className="badge">slack</span>}
                    </span>
                  </td>
                  <td>{formatDate(user.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="admin__subsection-title">Create user</h3>
      {createError && <p className="alert alert--error">{createError}</p>}
      <form className="admin__form admin__form--row" onSubmit={handleCreate}>
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
          placeholder="Password (min. 8 characters)"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
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
    </section>
  )
}
