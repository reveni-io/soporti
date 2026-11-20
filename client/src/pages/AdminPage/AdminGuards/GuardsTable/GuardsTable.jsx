import { useState } from 'react'
import DeleteConfirm from '../../../../common/DeleteConfirm/DeleteConfirm.jsx'
import Icon from '../../../../common/Icon/Icon.jsx'
import './GuardsTable.css'

const DELETE_QUESTION = 'Are you sure you want to delete this guard?'
const ICON_SIZE = 14

function describeUse(guard) {
  if (guard.questions === 0) return 'Not in the chat until it has questions'

  return guard.description || 'No description'
}

function GuardActions({ guard, deleting, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  function handleAskToDelete() {
    setConfirming(true)
  }

  function handleKeep() {
    setConfirming(false)
  }

  if (confirming) {
    return (
      <DeleteConfirm
        question={DELETE_QUESTION}
        busy={deleting}
        onConfirm={() => onDelete(guard.id)}
        onCancel={handleKeep}
      />
    )
  }

  return (
    <div className="guards-table__actions">
      <button
        className="btn btn--secondary btn--sm"
        type="button"
        onClick={() => onEdit(guard.id)}
        aria-label={`Edit ${guard.name}`}
      >
        Edit
      </button>
      <button
        className="btn btn--secondary btn--sm"
        type="button"
        onClick={handleAskToDelete}
        aria-label={`Delete ${guard.name}`}
        title="Delete"
      >
        <Icon name="trash" size={ICON_SIZE} />
      </button>
    </div>
  )
}

export default function GuardsTable({ guards, deleting = false, onEdit, onDelete }) {
  return (
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
                <GuardActions guard={guard} deleting={deleting} onEdit={onEdit} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
