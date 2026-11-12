import { useState } from 'react'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import { ANALYTICS_DASHBOARD_NAME_MAX_LENGTH } from '../../../constants.js'
import './DashboardNameForm.css'

export default function DashboardNameForm({
  initialName = '',
  placeholder,
  autoFocus,
  submitLabel,
  busyLabel,
  onSubmit,
  onDone,
  onCancel,
}) {
  const [name, setName] = useState(initialName)
  const { saving, error, save } = useSaveField()

  const trimmedName = name.trim()
  const canSubmit = Boolean(trimmedName) && trimmedName !== initialName && !saving

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    const isDone = await save(() => onSubmit(trimmedName))
    if (isDone) onDone()
  }

  return (
    <form className="dashboard-name-form" onSubmit={handleSubmit}>
      <label className="dashboard-name-form__field">
        <span className="dashboard-name-form__label">Name</span>
        <input
          className="input"
          maxLength={ANALYTICS_DASHBOARD_NAME_MAX_LENGTH}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={name}
          onChange={event => setName(event.target.value)}
        />
      </label>

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      <div className="modal__actions">
        {onCancel && (
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
          {saving ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  )
}
