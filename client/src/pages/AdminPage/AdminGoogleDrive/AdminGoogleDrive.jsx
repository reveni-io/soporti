import { useEffect, useState } from 'react'

// Google Drive section of the admin panel. The read-only Drive integration lets
// the agent search, browse and read documents shared with a Google service
// account. The credential is write-only (the private key is never returned);
// only the non-sensitive service-account email is shown so the admin can verify
// which account — and therefore which shared folders — is live.
export default function AdminGoogleDrive({ token, onLogout }) {
  const [configured, setConfigured] = useState(false)
  const [serviceAccountEmail, setServiceAccountEmail] = useState('')
  const [credentials, setCredentials] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/google-drive`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the Google Drive settings')
        const data = await res.json()
        if (!active) return
        setConfigured(data.credentialsConfigured)
        setServiceAccountEmail(data.serviceAccountEmail || '')
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [token, onLogout])

  async function saveCredentials(value) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/google-drive/credentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ credentials: value }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the credentials')
      setConfigured(data.credentialsConfigured)
      setServiceAccountEmail(data.serviceAccountEmail || '')
      setCredentials('')
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!credentials.trim()) return
    saveCredentials(credentials.trim())
  }

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Google Drive</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Google Drive</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Google Drive integration</h2>
        <p className="admin__muted">
          Lets the assistant search, browse and read documents in Google Drive (Docs, Sheets, Slides, PDFs and Office
          files). It is read-only and only sees what is explicitly shared with its service account.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {configured ? (
            <span className="badge badge--success">configured</span>
          ) : (
            <span className="badge">not configured</span>
          )}
        </p>

        {configured && serviceAccountEmail && (
          <dl className="admin__kv">
            <div className="admin__kv-row">
              <dt>Service account</dt>
              <dd>
                <code>{serviceAccountEmail}</code>
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Setup</h2>
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
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => saveCredentials('')}
                disabled={saving}
              >
                Remove
              </button>
            )}
            {!saveError && savedAt && <span className="admin__saved">Saved</span>}
          </div>
        </form>
      </section>
    </>
  )
}
