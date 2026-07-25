import { useState } from 'react'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'

export default function SecretField({
  placeholder,
  configuredPlaceholder,
  configured,
  onSave,
  onLogout,
  saveLabel = 'Save',
  removeLabel = 'Remove',
  masked = true,
  onGenerate,
}) {
  const [value, setValue] = useState('')
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  async function persist(next) {
    const saved = await save(() => onSave(next))
    if (saved) setValue('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!value.trim()) return
    persist(value.trim())
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type={masked ? 'password' : 'text'}
          placeholder={configured && configuredPlaceholder ? configuredPlaceholder : placeholder}
          autoComplete="off"
          value={value}
          onChange={event => setValue(event.target.value)}
          disabled={saving}
        />
        {onGenerate && (
          <button className="btn btn--secondary" type="button" onClick={() => setValue(onGenerate())} disabled={saving}>
            Generate
          </button>
        )}
        <button className="btn btn--primary" type="submit" disabled={saving || !value.trim()}>
          {saving ? 'Saving...' : saveLabel}
        </button>
        {configured && (
          <button className="btn btn--secondary" type="button" onClick={() => persist('')} disabled={saving}>
            {removeLabel}
          </button>
        )}
        {!error && savedAt && <span className="admin__saved">Saved</span>}
      </form>
    </>
  )
}
