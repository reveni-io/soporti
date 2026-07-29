import { EMPTY_CELL } from '../../../../constants.js'
import { channelLabel } from '../channels.js'
import { formatCount, formatDuration, formatTokens } from '../format.js'

export default function ChannelTable({ rows }) {
  if (!rows) return <p className="admin__muted">The channel breakdown is unavailable right now.</p>
  if (rows.length === 0) return <p className="admin__muted">No agent runs recorded yet.</p>

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Runs</th>
            <th>Failed</th>
            <th>Tokens in</th>
            <th>Tokens out</th>
            <th>p50</th>
            <th>p95</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.channel}>
              <td>{channelLabel(row.channel)}</td>
              <td>{formatCount(row.runs)}</td>
              <td>{row.failedRuns > 0 ? <span className="badge">{formatCount(row.failedRuns)}</span> : EMPTY_CELL}</td>
              <td>{formatTokens(row.inputTokens)}</td>
              <td>{formatTokens(row.outputTokens)}</td>
              <td>{formatDuration(row.p50DurationMs)}</td>
              <td>{formatDuration(row.p95DurationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
