import { JEV_GITHUB_DOCUMENT } from '../../../../constants.js'

function describeUse(guard) {
  if (guard.id === JEV_GITHUB_DOCUMENT) return 'PR reviews of the auto-approve repos'
  if (!guard.enabled) return 'Not in the chat while its Jev calls are off'
  if (guard.questions === 0 || !guard.model) return 'Not in the chat until it has questions and a model'

  return guard.description || 'No description'
}

export default function GuardsTable({ guards, selectedId, onSelect }) {
  return (
    <>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Used for</th>
              <th className="admin__nowrap">Jev calls</th>
              <th>Questions</th>
              <th>Calls</th>
              <th>Cases</th>
              <th>Sent</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {guards.map(guard => (
              <tr key={guard.id}>
                <td className="admin__nowrap">
                  <strong>{guard.name}</strong>
                </td>
                <td>{describeUse(guard)}</td>
                <td>
                  <span className={`badge${guard.enabled ? ' badge--success' : ''}`}>
                    {guard.enabled ? 'On' : 'Off'}
                  </span>
                </td>
                <td>{guard.questions}</td>
                <td>{guard.usage.calls.toLocaleString()}</td>
                <td>{guard.usage.cases.toLocaleString()}</td>
                <td>{guard.usage.sentReplies.toLocaleString()}</td>
                <td>
                  <button
                    className="btn btn--secondary btn--sm"
                    type="button"
                    onClick={() => onSelect(guard.id)}
                    disabled={guard.id === selectedId}
                    aria-label={`Edit ${guard.name}`}
                  >
                    {guard.id === selectedId ? 'Editing' : 'Edit'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin__muted">Calls, cases and sent replies of the last 30 days.</p>
    </>
  )
}
