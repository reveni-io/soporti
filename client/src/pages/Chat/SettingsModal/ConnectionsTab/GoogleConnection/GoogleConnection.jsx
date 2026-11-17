import GoogleAccessButton from '../../../../../common/GoogleAccessButton/GoogleAccessButton.jsx'
import { useGoogleConnection } from '../../../hooks/useGoogleConnection/useGoogleConnection.js'
import './GoogleConnection.css'

const GOOGLE_SERVICES = [
  { key: 'gmail', label: 'Gmail' },
  { key: 'calendar', label: 'Calendar' },
]

export default function GoogleConnection({ token, onLogout, onConnectionsChange }) {
  const { connection, loadError, saving, saveError, connect, disconnect } = useGoogleConnection(
    token,
    onLogout,
    onConnectionsChange
  )

  if (loadError) return <p className="alert alert--error">{loadError}</p>
  if (!connection) return <p className="settings-modal__description">Loading...</p>

  const connected = Boolean(connection.connected)
  const canConnect = Boolean(connection.available && connection.scopes?.length)

  function handleGrantError() {
    connect(null)
  }

  return (
    <div className="connections-tab__item">
      <div className="connections-tab__head">
        <span className="connections-tab__name">Gmail &amp; Google Calendar</span>
        <span className={connected ? 'badge badge--success' : 'badge'}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <p className="connections-tab__help">
        Lets Soporti search and read <strong>your</strong> email, list the events of <strong>your</strong> calendar and
        check when your colleagues are free. Read-only: it never sends, drafts or deletes an email and never creates or
        changes an event.
      </p>

      {!connection.available && (
        <p className="note">
          An admin has to add the Google client secret in /admin → Authentication before you can connect Gmail and
          Calendar.
        </p>
      )}

      {connected && <GrantedAccess connection={connection} />}

      {saveError && <p className="alert alert--error">{saveError}</p>}

      {(canConnect || connected) && (
        <div className="connections-tab__form">
          {canConnect && (
            <GoogleAccessButton
              scopes={connection.scopes}
              label={connected ? 'Reconnect Google' : 'Connect Google'}
              disabled={saving}
              onCode={connect}
              onError={handleGrantError}
            />
          )}
          {connected && (
            <button className="btn btn--secondary" type="button" onClick={disconnect} disabled={saving}>
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function GrantedAccess({ connection }) {
  const isPartial = GOOGLE_SERVICES.some(service => !connection[service.key])

  return (
    <div className="google-connection__access">
      <p className="connections-tab__help">
        Connected as <strong>{connection.email}</strong>.
      </p>

      <ul className="google-connection__services">
        {GOOGLE_SERVICES.map(service => (
          <li key={service.key} className={connection[service.key] ? 'badge badge--success' : 'badge'}>
            {connection[service.key] ? service.label : `${service.label} not granted`}
          </li>
        ))}
      </ul>

      {isPartial && (
        <p className="connections-tab__help">
          Google let you untick a permission. Reconnect and keep both boxes ticked to add the missing one.
        </p>
      )}
    </div>
  )
}
