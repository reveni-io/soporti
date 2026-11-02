import { useId } from 'react'
import CopyButton from '../../../../common/CopyButton/CopyButton.jsx'
import PermissionField from '../../PermissionField/PermissionField.jsx'
import { useHubspotPermissions } from '../hooks/useHubspotPermissions/useHubspotPermissions.js'
import './HubspotPermissionsForm.css'

export default function HubspotPermissionsForm({ token, config, onLogout, onSaved }) {
  const { draft, scopes, dirty, repliesEnabled, fullEnabled, saving, error, savedAt, setLevel, submit } =
    useHubspotPermissions({ token, config, onLogout, onSaved })

  function handleSubmit(event) {
    event.preventDefault()
    submit()
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form" onSubmit={handleSubmit}>
        <div className="hubspot-permissions__areas">
          {config.areas.map(area => (
            <PermissionField
              key={area.id}
              area={area.label}
              levels={area.levels}
              value={draft[area.id]}
              disabled={saving}
              onChange={level => setLevel(area.id, level)}
            />
          ))}
        </div>

        {repliesEnabled && (
          <p className="alert alert--warning">
            Replies go out as the HubSpot user of the person who asks for them, matched by their email, and reach the
            customer exactly as approved. Replying is not available from Slack, over MCP, in scheduled queries or in
            auto-diagnoses.
          </p>
        )}

        {fullEnabled && (
          <p className="alert alert--warning">
            Archiving, merging and removing associations are not available over MCP, in scheduled queries or
            auto-diagnoses either: nobody in Soporti confirms them there.
          </p>
        )}

        <div className="admin__form admin__form--row">
          <button className="btn btn--primary" type="submit" disabled={saving || !dirty}>
            {saving ? 'Saving...' : 'Save permissions'}
          </button>
          {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
        </div>
      </form>

      <ScopeList scopes={scopes} />
    </>
  )
}

function ScopeList({ scopes }) {
  const titleId = useId()

  return (
    <div className="hubspot-permissions__scopes">
      <div className="hubspot-permissions__scopes-header">
        <h3 className="admin__subsection-title" id={titleId}>
          Scopes the key needs
        </h3>
        <CopyButton text={scopes.join('\n')} ariaLabel="Copy the scopes" />
      </div>

      <ul className="admin__chips" aria-labelledby={titleId}>
        {scopes.map(scope => (
          <li key={scope} className="chip">
            <code>{scope}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}
