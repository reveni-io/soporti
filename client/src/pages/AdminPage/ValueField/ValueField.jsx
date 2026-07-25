import { useState } from 'react'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'

export default function ValueField({
  savedValue,
  onSave,
  onLogout,
  placeholder,
  type = 'text',
  min,
  step,
  saveLabel = 'Save',
  removable = false,
  removeLabel = 'Remove',
}) {
  const [edited, setEdited] = useState(null)
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const value = edited ?? savedValue
  const dirty = value.trim() !== savedValue

  function persist(next) {
    save(async () => {
      await onSave(next)
      setEdited(null)
    })
  }

  function handleSubmit(event) {
    event.preventDefault()
    persist(value.trim())
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type={type}
          min={min}
          step={step}
          placeholder={placeholder}
          autoComplete="off"
          value={value}
          onChange={event => setEdited(event.target.value)}
          disabled={saving}
        />
        <button className="btn btn--primary" type="submit" disabled={saving || !dirty}>
          {saving ? 'Saving...' : saveLabel}
        </button>
        {removable && savedValue && (
          <button className="btn btn--secondary" type="button" onClick={() => persist('')} disabled={saving}>
            {removeLabel}
          </button>
        )}
        {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
      </form>
    </>
  )
}
