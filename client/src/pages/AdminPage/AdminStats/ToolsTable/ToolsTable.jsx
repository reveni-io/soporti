import { formatCount } from '../format.js'

export default function ToolsTable({ tools }) {
  if (!tools) return <p className="admin__muted">The tool ranking is unavailable right now.</p>
  if (tools.length === 0) return <p className="admin__muted">No tool calls recorded yet.</p>

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Calls</th>
          </tr>
        </thead>
        <tbody>
          {tools.map(tool => (
            <tr key={tool.tool}>
              <td>
                <code>{tool.tool}</code>
              </td>
              <td>{formatCount(tool.calls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
