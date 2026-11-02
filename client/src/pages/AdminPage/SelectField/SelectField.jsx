import { useState } from 'react'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'

export default function SelectField({ savedValue, options, ariaLabel, saveLabel, onSave, onLogout }) {
  const [edited, setEdited] = useState(null)
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const value = edited ?? savedValue
  const dirty = value !== savedValue

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

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <select
          className="input admin__input--select"
          aria-label={ariaLabel}
          value={value}
          onChange={event => setEdited(event.target.value)}
          disabled={saving}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="btn btn--primary" type="submit" disabled={saving || !dirty}>
          {saving ? 'Saving...' : saveLabel}
        </button>
        {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
      </form>
    </>
  )
}
