import GranolaConnection from './GranolaConnection/GranolaConnection.jsx'
import ZendeskConnection from './ZendeskConnection/ZendeskConnection.jsx'
import './ConnectionsTab.css'

export default function ConnectionsTab({ token, onLogout, onConnectionsChange }) {
  return (
    <div className="settings-modal__panel connections-tab">
      <p className="settings-modal__description">
        Connect your own accounts. These credentials are yours alone — Soporti only ever reaches what your own account
        can see, and no one else in this workspace can use them.
      </p>

      <GranolaConnection token={token} onLogout={onLogout} onConnectionsChange={onConnectionsChange} />
      <ZendeskConnection token={token} onLogout={onLogout} onConnectionsChange={onConnectionsChange} />
    </div>
  )
}
