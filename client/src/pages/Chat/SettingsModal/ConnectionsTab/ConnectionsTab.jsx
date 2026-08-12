import { useState } from 'react'
import { useAuthedConfig } from '../../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { getGranolaConnection, saveGranolaApiKey } from '../../../../services/services.js'
import './ConnectionsTab.css'

export default function ConnectionsTab({ token, onLogout, onConnectionsChange }) {
  const { config, error: loadError, patchConfig } = useAuthedConfig(getGranolaConnection, token, onLogout)
  const { saving, error: saveError, save } = useSaveField(onLogout)
  const [apiKey, setApiKey] = useState('')

  async function persist(value) {
    const saved = await save(async () => {
      const data = await saveGranolaApiKey(token, value)
      patchConfig({ connected: Boolean(data.connected) })
    })
    if (!saved) return

    setApiKey('')
    onConnectionsChange?.()
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!apiKey.trim()) return
    persist(apiKey.trim())
  }

  if (loadError) return <p className="alert alert--error">{loadError}</p>
  if (!config) return <p className="settings-modal__description">Loading...</p>

  const connected = Boolean(config.connected)

  return (
    <div className="settings-modal__panel connections-tab">
      <p className="settings-modal__description">
        Connect your own accounts. These credentials are yours alone — Soporti only ever reads what your own account can
        see, and no one else in this workspace can reach it.
      </p>

      <div className="connections-tab__item">
        <div className="connections-tab__head">
          <span className="connections-tab__name">Granola</span>
          <span className={connected ? 'badge badge--success' : 'badge'}>
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <p className="connections-tab__help">
          Lets Soporti search and read <strong>your</strong> meeting notes. Create a personal API key in Granola under
          Settings → Connectors → API keys with the <em>Notes (read)</em> scope, then paste it here. It is stored
          write-only and never shown again.
        </p>

        {saveError && <p className="alert alert--error">{saveError}</p>}

        <form className="connections-tab__form" onSubmit={handleSubmit}>
          <input
            className="input"
            type="password"
            placeholder={connected ? 'Paste a new key to replace it' : 'grn_...'}
            aria-label="Granola API key"
            autoComplete="off"
            value={apiKey}
            onChange={event => setApiKey(event.target.value)}
            disabled={saving}
          />
          <button className="btn btn--primary" type="submit" disabled={saving || !apiKey.trim()}>
            {saving ? 'Saving...' : 'Connect'}
          </button>
          {connected && (
            <button className="btn btn--secondary" type="button" onClick={() => persist('')} disabled={saving}>
              Disconnect
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
