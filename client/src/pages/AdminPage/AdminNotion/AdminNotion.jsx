import { useEffect, useState } from 'react'

export default function AdminNotion({ token, onLogout }) {
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [notionToken, setNotionToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/notion`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the Notion settings')
        const data = await res.json()
        if (!active) return
        setTokenConfigured(data.tokenConfigured)
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

  async function saveToken(value) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/notion/token`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token: value }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the token')
      setTokenConfigured(data.tokenConfigured)
      setNotionToken('')
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!notionToken.trim()) return
    saveToken(notionToken.trim())
  }

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Notion</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Notion</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Notion integration</h2>
        <p className="admin__muted">
          Lets the assistant search and read pages and databases from Notion. It only sees what is shared with the
          integration. The token is stored in the database and never shown again after saving.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {tokenConfigured ? (
            <span className="badge badge--success">configured</span>
          ) : (
            <span className="badge">not configured</span>
          )}
        </p>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Setup</h2>
        <ol className="admin__steps">
          <li>
            In Notion, open <strong>Settings → Connections → Develop or manage integrations</strong> and create a{' '}
            <strong>new internal integration</strong>.
          </li>
          <li>
            Copy its <strong>Internal Integration Secret</strong> (it starts with <code>ntn_</code>).
          </li>
          <li>
            <strong>Share</strong> the pages/databases you want the assistant to read with the integration (open a page
            → <strong>•••</strong> → <strong>Connections</strong> → add it). This sharing is the entire access boundary.
          </li>
          <li>Paste the secret below. It is stored write-only and never shown again.</li>
        </ol>

        {saveError && <p className="alert alert--error">{saveError}</p>}

        <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
          <input
            className="input"
            type="password"
            placeholder={tokenConfigured ? 'Paste a new token to replace it' : 'ntn_...'}
            autoComplete="off"
            value={notionToken}
            onChange={event => setNotionToken(event.target.value)}
            disabled={saving}
          />
          <button className="btn btn--primary" type="submit" disabled={saving || !notionToken.trim()}>
            {saving ? 'Saving...' : 'Save token'}
          </button>
          {tokenConfigured && (
            <button className="btn btn--secondary" type="button" onClick={() => saveToken('')} disabled={saving}>
              Remove
            </button>
          )}
          {!saveError && savedAt && <span className="admin__saved">Saved</span>}
        </form>
      </section>
    </>
  )
}
