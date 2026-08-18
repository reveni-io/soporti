import { EMPTY_CELL } from '../../../../constants.js'
import { formatDateTime } from '../../dates.js'
import { formatCount, formatTokens } from '../format.js'

function userLabel(row) {
  return row.email || row.name || `User #${row.userId}`
}

export default function TopUsersTable({ rows }) {
  if (!rows) return <p className="admin__muted">The user breakdown is unavailable right now.</p>
  if (rows.length === 0) return <p className="admin__muted">No user activity recorded yet.</p>

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>User</th>
            <th>Convs</th>
            <th>Asked</th>
            <th>Runs</th>
            <th>Failed</th>
            <th>Tokens in</th>
            <th>Tokens out</th>
            <th>Last active</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.userId}>
              <td>{userLabel(row)}</td>
              <td>{formatCount(row.conversations)}</td>
              <td>{formatCount(row.userMessages)}</td>
              <td>{formatCount(row.runs)}</td>
              <td>{row.failedRuns > 0 ? <span className="badge">{formatCount(row.failedRuns)}</span> : EMPTY_CELL}</td>
              <td>{formatTokens(row.inputTokens)}</td>
              <td>{formatTokens(row.outputTokens)}</td>
              <td>{formatDateTime(row.lastActiveAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
