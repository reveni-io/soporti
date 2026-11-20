import { useState } from 'react'
import { createGuard } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

const MAX_NAME_LENGTH = 60

export default function NewGuardForm({ token, onLogout, onCreated }) {
  const [name, setName] = useState('')
  const { saving, error, save } = useSaveField(onLogout)

  function handleNameChange(event) {
    setName(event.target.value)
  }

  function handleSubmit(event) {
    event.preventDefault()
    save(async () => {
      const { guard } = await createGuard(token, name.trim())
      setName('')
      onCreated(guard)
    })
  }

  return (
    <form className="admin__form" onSubmit={handleSubmit}>
      <div className="admin__form admin__form--row">
        <input
          className="input"
          aria-label="Name of the new guard"
          placeholder="Name of a new guard, e.g. Refunds"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={handleNameChange}
          disabled={saving}
        />
        <button className="btn btn--primary" type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Creating...' : 'New guard'}
        </button>
      </div>
      {error && <p className="alert alert--error">{error}</p>}
    </form>
  )
}
