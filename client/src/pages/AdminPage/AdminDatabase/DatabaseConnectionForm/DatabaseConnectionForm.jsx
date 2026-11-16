import { useState } from 'react'
import { addDatabaseConnection } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

const NAME_MAX_LENGTH = 60

export default function DatabaseConnectionForm({ token, onLogout, onAdded }) {
  const [name, setName] = useState('')
  const [connectionString, setConnectionString] = useState('')
  const { saving, error, save } = useSaveField(onLogout)

  const isComplete = Boolean(name.trim() && connectionString.trim())

  function handleSubmit(event) {
    event.preventDefault()
    save(async () => {
      await addDatabaseConnection(token, { name: name.trim(), connectionString: connectionString.trim() })

      setName('')
      setConnectionString('')
      onAdded()
    })
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type="text"
          placeholder="Name, e.g. production"
          aria-label="Connection name"
          maxLength={NAME_MAX_LENGTH}
          value={name}
          onChange={event => setName(event.target.value)}
          disabled={saving}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="postgresql://user:password@host:5432/dbname"
          aria-label="Connection string"
          autoComplete="off"
          value={connectionString}
          onChange={event => setConnectionString(event.target.value)}
          disabled={saving}
          required
        />
        <button className="btn btn--primary" type="submit" disabled={saving || !isComplete}>
          {saving ? 'Adding...' : 'Add connection'}
        </button>
      </form>
    </>
  )
}
