import './DeleteConfirm.css'

export default function DeleteConfirm({ question, busy, onConfirm, onCancel }) {
  return (
    <div className="delete-confirm" role="group" aria-label={question}>
      <span className="delete-confirm__question">{question}</span>
      <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={onConfirm}>
        Yes, delete
      </button>
      <button type="button" className="btn btn--secondary btn--sm" autoFocus onClick={onCancel}>
        Keep it
      </button>
    </div>
  )
}
