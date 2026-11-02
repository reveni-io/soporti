import { useId, useState } from 'react'
import { useEscapeKey } from '../../../../hooks/useEscapeKey/useEscapeKey.js'
import { useOverlayDismiss } from '../../../../hooks/useOverlayDismiss/useOverlayDismiss.js'
import './VariantModal.css'

const CHANGE_ROWS = 4
const CHANGE_MAX_LENGTH = 4000
const CHANGE_PLACEHOLDER = 'e.g. Brand it for Acme: their logo and colors, and the copy in Spanish.'

export default function VariantModal({ busy, error, onClose, onSubmit }) {
  const [draft, setDraft] = useState('')
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const overlayProps = useOverlayDismiss(onClose)
  const fieldId = useId()
  const change = draft.trim()
  useEscapeKey(onClose)

  async function handleSubmit(event) {
    event.preventDefault()
    setHasSubmitted(true)
    if (await onSubmit(change)) onClose()
  }

  return (
    <div className="modal-overlay" {...overlayProps}>
      <form className="modal variant-modal" role="dialog" aria-label="Create a variant" onSubmit={handleSubmit}>
        <div className="modal__header">
          <h2 className="modal__title">Create a variant</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <p className="variant-modal__lead">
          A variant is a new video with the same brief and storyboard, made from this one with your change.
        </p>

        <label className="variant-modal__label" htmlFor={fieldId}>
          What should change?
        </label>
        <textarea
          id={fieldId}
          className="textarea"
          rows={CHANGE_ROWS}
          maxLength={CHANGE_MAX_LENGTH}
          placeholder={CHANGE_PLACEHOLDER}
          value={draft}
          onChange={event => setDraft(event.target.value)}
        />

        {hasSubmitted && error && <p className="alert alert--error">{error}</p>}

        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !change}>
            Create variant
          </button>
        </div>
      </form>
    </div>
  )
}
