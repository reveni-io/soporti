import { useState } from 'react'

export default function SendConfirm({ recipient, label, needsCare, edited, sending, error, onCancel, onSend }) {
  const [warningsRead, setWarningsRead] = useState(false)

  function handleWarningsChange(event) {
    setWarningsRead(event.target.checked)
  }

  function handleSend() {
    onSend(warningsRead)
  }

  return (
    <div className="legal-run__confirm" role="group" aria-label="Confirm the reply">
      <p>
        Send this reply to <strong>{recipient || 'the customer'}</strong> on {label}? It goes out as you, and the
        customer receives it as it is.
      </p>
      {edited && (
        <p className="legal-run__muted">
          You edited the reply after the review: the review does not cover your changes.
        </p>
      )}
      {needsCare && (
        <label className="legal-run__check">
          <input type="checkbox" checked={warningsRead} onChange={handleWarningsChange} />I read the warnings of this
          case
        </label>
      )}
      {error && <p className="alert alert--error">{error}</p>}
      <div className="legal-run__actions">
        <button className="btn btn--secondary btn--sm" type="button" onClick={onCancel} disabled={sending}>
          Cancel
        </button>
        <button
          className="btn btn--primary btn--sm"
          type="button"
          onClick={handleSend}
          disabled={sending || (needsCare && !warningsRead)}
        >
          {sending ? 'Sending...' : 'Send reply'}
        </button>
      </div>
    </div>
  )
}
