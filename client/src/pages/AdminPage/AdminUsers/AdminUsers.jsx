import { useEffect, useState, useCallback } from 'react'
import { getAdminUsers, isUnauthorized } from '../../../services/services.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import CreateUserForm from './CreateUserForm/CreateUserForm.jsx'
import UsersTable from './UsersTable/UsersTable.jsx'

export default function AdminUsers({ token, onLogout }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await getAdminUsers(token)
      setUsers(data.users)
      setError(null)
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, onLogout])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AdminSection title="Users">
      <p className="admin__muted">
        Users sign in with Google (allowed domains below) or with an email and password created here.
      </p>

      {error && <p className="alert alert--error">{error}</p>}

      <UsersTable users={users} loading={loading} />

      <h3 className="admin__subsection-title">Create user</h3>

      <CreateUserForm token={token} onLogout={onLogout} onCreated={load} />
    </AdminSection>
  )
}
