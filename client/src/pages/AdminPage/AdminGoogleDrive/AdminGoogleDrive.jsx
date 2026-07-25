import { useState } from 'react'
import { getGoogleDriveConfig, saveGoogleDriveCredentials } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'

export default function AdminGoogleDrive({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getGoogleDriveConfig, token, onLogout)
  const [credentials, setCredentials] = useState('')
  const { saving, error: saveError, savedAt, save } = useSaveField(onLogout)

  async function persist(value) {
    const saved = await save(async () => {
      const data = await saveGoogleDriveCredentials(token, value)
      patchConfig({
        credentialsConfigured: data.credentialsConfigured,
        serviceAccountEmail: data.serviceAccountEmail || '',
      })
    })
    if (saved) setCredentials('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!credentials.trim()) return
    persist(credentials.trim())
  }

  if (error || !config) return <AdminSectionStatus title="Google Drive" error={error} />

  const configured = config.credentialsConfigured

  return (
    <>
      <AdminSection title="Google Drive integration">
        <p className="admin__muted">
          Lets the assistant search, browse and read documents in Google Drive (Docs, Sheets, Slides, PDFs and Office
          files). It is read-only and only sees what is explicitly shared with its service account.
        </p>

        <StatusRow configured={configured} />

        {configured && config.serviceAccountEmail && (
          <dl className="admin__kv">
            <div className="admin__kv-row">
              <dt>Service account</dt>
              <dd>
                <code>{config.serviceAccountEmail}</code>
              </dd>
            </div>
          </dl>
        )}
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            In the Google Cloud Console, create a <strong>service account</strong> and enable the{' '}
            <strong>Google Drive API</strong> for its project.
          </li>
          <li>
            Create a <strong>JSON key</strong> for that service account and download it.
          </li>
          <li>
            <strong>Share</strong> the Drive folders/files you want the assistant to read with the service account email
            below, as <strong>Viewer</strong>. This sharing is the entire access boundary — the assistant can read
            exactly what is shared, nothing more.
          </li>
          <li>
            Paste the key below: either the raw JSON or its base64 blob (the value previously held in{' '}
            <code>GOOGLE_DRIVE_SA_CREDENTIALS_B64</code>). It is stored write-only and never shown again.
          </li>
        </ol>
        <p className="admin__muted">
          The size and concurrency limits stay optional environment variables (<code>GOOGLE_DRIVE_MAX_BYTES</code>,{' '}
          <code>GOOGLE_DRIVE_MAX_CHARS</code>, <code>GOOGLE_DRIVE_DOWNLOAD_TIMEOUT_MS</code>,{' '}
          <code>GOOGLE_DRIVE_PARSE_CONCURRENCY</code>) with sensible defaults.
        </p>

        {saveError && <p className="alert alert--error">{saveError}</p>}

        <form className="admin__form" onSubmit={handleSubmit}>
          <textarea
            className="textarea textarea--code"
            placeholder={
              configured
                ? 'Paste a new key (JSON or base64) to replace it'
                : '{ "type": "service_account", "client_email": "...", "private_key": "..." }  — or its base64 blob'
            }
            autoComplete="off"
            value={credentials}
            onChange={event => setCredentials(event.target.value)}
            disabled={saving}
            rows={8}
          />

          <div className="admin__form admin__form--row">
            <button className="btn btn--primary" type="submit" disabled={saving || !credentials.trim()}>
              {saving ? 'Saving...' : 'Save credentials'}
            </button>
            {configured && (
              <button className="btn btn--secondary" type="button" onClick={() => persist('')} disabled={saving}>
                Remove
              </button>
            )}
            {!saveError && savedAt && <span className="admin__saved">Saved</span>}
          </div>
        </form>
      </AdminSection>
    </>
  )
}
