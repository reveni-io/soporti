import { useState } from 'react'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'

export default function ToggleField({ enabled, label, hint, onSave, onLogout }) {
  const [edited, setEdited] = useState(null)
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const value = edited ?? enabled
  const dirty = value !== enabled

  function handleSubmit(event) {
    event.preventDefault()
    save(async () => {
      await onSave(value)
      setEdited(null)
    })
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form" onSubmit={handleSubmit}>
        <label className="admin__switch">
          <input
            type="checkbox"
            checked={value}
            onChange={event => setEdited(event.target.checked)}
            disabled={saving}
          />
          <span className="admin__switch-slider" aria-hidden="true" />
          <span className="admin__switch-label">
            {label}
            <span className="admin__muted">{hint}</span>
          </span>
        </label>

        <div className="admin__form admin__form--row">
          <button className="btn btn--primary" type="submit" disabled={saving || !dirty}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
        </div>
      </form>
    </>
  )
}
