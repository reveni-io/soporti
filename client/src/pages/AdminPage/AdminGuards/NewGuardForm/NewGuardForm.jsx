import { useState } from 'react'
import { createGuard } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

export default function NewGuardForm({ token, onLogout, onCreated }) {
  const [name, setName] = useState('')
  const { saving, error, save } = useSaveField(onLogout)

  function handleNameChange(event) {
    setName(event.target.value)
  }

  function handleSubmit(event) {
    event.preventDefault()
    save(async () => {
      const guard = await createGuard(token, name)
      setName('')
      onCreated(guard.id)
    })
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}
      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          aria-label="Name of the new guard"
          placeholder="Name of the new guard, e.g. Legal Review"
          value={name}
          onChange={handleNameChange}
          disabled={saving}
        />
        <button className="btn btn--secondary" type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Creating...' : 'New guard'}
        </button>
      </form>
    </>
  )
}
