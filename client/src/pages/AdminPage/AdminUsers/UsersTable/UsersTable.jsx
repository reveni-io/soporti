const EMPTY_CELL = '—'

function formatDate(value) {
  if (!value) return EMPTY_CELL
  const date = new Date(value)
  return isNaN(date) ? EMPTY_CELL : date.toLocaleDateString()
}

export default function UsersTable({ users, loading }) {
  if (loading) return <p className="admin__muted">Loading...</p>

  return (
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
              <td>{user.email || EMPTY_CELL}</td>
              <td>{user.name || user.slackId || EMPTY_CELL}</td>
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
  )
}
