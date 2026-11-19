import { useState } from 'react'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

const EMPTY_KEY = { accessKeyId: '', secretAccessKey: '' }

export default function AwsAccessKeyForm({ configured, onSave, onLogout }) {
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const isComplete = Boolean(accessKeyId.trim() && secretAccessKey.trim())

  async function persist(key) {
    const saved = await save(() => onSave(key))
    if (!saved) return

    setAccessKeyId('')
    setSecretAccessKey('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    persist({ accessKeyId: accessKeyId.trim(), secretAccessKey: secretAccessKey.trim() })
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type="text"
          placeholder={configured ? 'New access key ID' : 'Access key ID (AKIA...)'}
          aria-label="Access key ID"
          autoComplete="off"
          value={accessKeyId}
          onChange={event => setAccessKeyId(event.target.value)}
          disabled={saving}
        />
        <input
          className="input"
          type="password"
          placeholder="Secret access key"
          aria-label="Secret access key"
          autoComplete="off"
          value={secretAccessKey}
          onChange={event => setSecretAccessKey(event.target.value)}
          disabled={saving}
        />
        <button className="btn btn--primary" type="submit" disabled={saving || !isComplete}>
          {saving ? 'Saving...' : 'Save key'}
        </button>
        {configured && (
          <button className="btn btn--secondary" type="button" onClick={() => persist(EMPTY_KEY)} disabled={saving}>
            Remove
          </button>
        )}
        {!error && savedAt && <span className="admin__saved">Saved</span>}
      </form>
    </>
  )
}
