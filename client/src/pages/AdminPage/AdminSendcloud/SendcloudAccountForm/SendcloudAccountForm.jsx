import { useState } from 'react'
import { linkSendcloudAccount } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

const NAME_MAX_LENGTH = 60

export default function SendcloudAccountForm({ token, onLogout, onLinked }) {
  const [name, setName] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const { saving, error, save } = useSaveField(onLogout)

  const isComplete = Boolean(name.trim() && publicKey.trim() && secretKey.trim())

  function handleSubmit(event) {
    event.preventDefault()
    save(async () => {
      await linkSendcloudAccount(token, { name: name.trim(), publicKey: publicKey.trim(), secretKey: secretKey.trim() })

      setName('')
      setPublicKey('')
      setSecretKey('')
      onLinked()
    })
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type="text"
          placeholder="Name, e.g. Acme EU"
          aria-label="Account name"
          maxLength={NAME_MAX_LENGTH}
          value={name}
          onChange={event => setName(event.target.value)}
          disabled={saving}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Public key"
          aria-label="Public key"
          autoComplete="off"
          value={publicKey}
          onChange={event => setPublicKey(event.target.value)}
          disabled={saving}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Secret key"
          aria-label="Secret key"
          autoComplete="off"
          value={secretKey}
          onChange={event => setSecretKey(event.target.value)}
          disabled={saving}
          required
        />
        <button className="btn btn--primary" type="submit" disabled={saving || !isComplete}>
          {saving ? 'Linking...' : 'Link account'}
        </button>
      </form>
    </>
  )
}
