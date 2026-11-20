function describeUse(guard) {
  if (guard.questions === 0 || !guard.model) return 'Not in the chat until it has questions and a model'

  return guard.description || 'No description'
}

export default function GuardsTable({ guards, onEdit }) {
  return (
    <>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Used for</th>
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
                <td>{guard.questions}</td>
                <td>{guard.usage.calls.toLocaleString()}</td>
                <td>{guard.usage.cases.toLocaleString()}</td>
                <td>{guard.usage.sentReplies.toLocaleString()}</td>
                <td>
                  <button
                    className="btn btn--secondary btn--sm"
                    type="button"
                    onClick={() => onEdit(guard.id)}
                    aria-label={`Edit ${guard.name}`}
                  >
                    Edit
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
