import { formatDateTime } from '../dates.js'
import './DocBar.css'

export default function DocBar({ label, state }) {
  const { document, dirty, saving, saveError, conflict, savedAt, save, reload } = state
  const lastSave = document.savedAt ? ` · saved ${formatDateTime(document.savedAt)} by ${document.savedBy}` : ''

  return (
    <div className="docbar card">
      {saveError && <p className="alert alert--error">{saveError}</p>}

      <div className="admin__form admin__form--row">
        <span className="admin__muted docbar__text" title={`${label} · version ${document.rev}${lastSave}`}>
          <strong>{label}</strong> · version {document.rev}
          {lastSave}
        </span>
        {dirty && <span className="badge badge--warning">Unsaved changes</span>}
        {conflict && (
          <button className="btn btn--secondary" type="button" onClick={reload}>
            Reload latest
          </button>
        )}
        <button className="btn btn--primary" type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving...' : `Save (v${document.rev} → v${document.rev + 1})`}
        </button>
        {!saveError && savedAt && !dirty && <span className="admin__saved">Saved</span>}
      </div>
    </div>
  )
}
