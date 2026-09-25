import { useState } from 'react'
import { useZendeskConnection } from '../../../hooks/useZendeskConnection/useZendeskConnection.js'
import './ZendeskConnection.css'

export default function ZendeskConnection({ token, onLogout, onConnectionsChange }) {
  const { connection, loadError, saving, saveError, connect, disconnect, saveView, saveWrites } = useZendeskConnection(
    token,
    onLogout,
    onConnectionsChange
  )
  const [subdomain, setSubdomain] = useState('')
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [editedViewId, setEditedViewId] = useState(null)

  if (loadError) return <p className="alert alert--error">{loadError}</p>
  if (!connection) return <p className="settings-modal__description">Loading...</p>

  const connected = Boolean(connection.connected)
  const canConnect = Boolean(subdomain.trim() && email.trim() && apiToken.trim())
  const storedViewId = connection.viewId ?? ''
  const viewId = editedViewId ?? storedViewId
  const isViewDirty = viewId.trim() !== storedViewId

  async function handleConnect(event) {
    event.preventDefault()

    const saved = await connect({ subdomain, email, apiToken })
    if (!saved) return

    setSubdomain('')
    setEmail('')
    setApiToken('')
  }

  async function handleSaveView(event) {
    event.preventDefault()

    const saved = await saveView(viewId.trim())
    if (saved) setEditedViewId(null)
  }

  return (
    <div className="connections-tab__item">
      <div className="connections-tab__head">
        <span className="connections-tab__name">Zendesk</span>
        <span className={connected ? 'badge badge--success' : 'badge'}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <p className="connections-tab__help">
        Lets Soporti read tickets from <strong>your</strong> Zendesk account and, when you allow it, post internal notes
        on them — never a public reply, never a status change. A Zendesk admin creates the API token under Admin Center
        → Apps and integrations → Zendesk API; connect it with the email of <strong>your</strong> agent account so
        Soporti acts as you. The token is stored write-only and never shown again.
      </p>

      {saveError && <p className="alert alert--error">{saveError}</p>}

      {!connected && (
        <form className="zendesk-connection__credentials" onSubmit={handleConnect}>
          <input
            className="input"
            type="text"
            placeholder="Subdomain (acme for acme.zendesk.com)"
            aria-label="Zendesk subdomain"
            value={subdomain}
            onChange={event => setSubdomain(event.target.value)}
            disabled={saving}
          />
          <input
            className="input"
            type="email"
            placeholder="you@company.com"
            aria-label="Zendesk agent email"
            autoComplete="off"
            value={email}
            onChange={event => setEmail(event.target.value)}
            disabled={saving}
          />
          <input
            className="input"
            type="password"
            placeholder="API token"
            aria-label="Zendesk API token"
            autoComplete="off"
            value={apiToken}
            onChange={event => setApiToken(event.target.value)}
            disabled={saving}
          />
          <div className="connections-tab__form">
            <button className="btn btn--primary" type="submit" disabled={saving || !canConnect}>
              {saving ? 'Saving...' : 'Connect'}
            </button>
          </div>
        </form>
      )}

      {connected && (
        <>
          <p className="connections-tab__help">
            Connected to <strong>{connection.subdomain}.zendesk.com</strong> as <strong>{connection.email}</strong>.
          </p>

          <form className="connections-tab__form" onSubmit={handleSaveView}>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              placeholder="View id (empty: every ticket the token can see)"
              aria-label="Zendesk view id"
              value={viewId}
              onChange={event => setEditedViewId(event.target.value)}
              disabled={saving}
            />
            <button className="btn btn--secondary" type="submit" disabled={saving || !isViewDirty}>
              Save view
            </button>
          </form>
          <p className="zendesk-connection__hint">
            With a view set, Soporti only reads and writes the tickets in that view.
          </p>

          <label className="zendesk-connection__writes">
            <input
              type="checkbox"
              checked={Boolean(connection.writesEnabled)}
              onChange={event => saveWrites(event.target.checked)}
              disabled={saving}
            />
            Let Soporti post internal notes on my tickets
          </label>

          <div className="connections-tab__form">
            <button className="btn btn--secondary" type="button" onClick={disconnect} disabled={saving}>
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  )
}
