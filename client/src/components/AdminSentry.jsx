import { useEffect, useState } from 'react'

// Sentry section of the admin panel. The integration lets the assistant search
// and inspect Sentry issues. The auth token is write-only (the server never
// returns it); the organization slug is not a secret, so its current value is
// shown and editable.
export default function AdminSentry({ token, onLogout }) {
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [org, setOrg] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/sentry`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the Sentry settings')
        const data = await res.json()
        if (!active) return
        setTokenConfigured(data.tokenConfigured)
        setOrg(data.org)
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

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Sentry</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Sentry</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  const configured = tokenConfigured && Boolean(org)

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Sentry integration</h2>
        <p className="admin__muted">
          Lets the assistant search and inspect production errors and issues in Sentry. Both values are stored in the
          database; the auth token is never shown again after saving.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {configured ? (
            <span className="badge badge--success">configured</span>
          ) : (
            <span className="badge">not configured</span>
          )}
        </p>
        <p className="admin__muted">
          The integration is enabled once both the organization and the auth token are set.
        </p>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Setup</h2>
        <ol className="admin__steps">
          <li>
            Your <strong>organization</strong> is the slug in your Sentry URL: the <code>my-org</code> in{' '}
            <code>sentry.io/organizations/my-org/</code>.
          </li>
          <li>
            In Sentry, open <strong>Settings → Auth Tokens</strong> and create a token with issue read access. Copy the{' '}
            <strong>auth token</strong>.
          </li>
          <li>Save both values below. The auth token is stored write-only and never shown again.</li>
        </ol>
      </section>

      <OrgField org={org} setOrg={setOrg} token={token} onLogout={onLogout} />

      <TokenField configured={tokenConfigured} setConfigured={setTokenConfigured} token={token} onLogout={onLogout} />
    </>
  )
}

// The organization slug is not a secret: the current value is shown in the
// input and can be edited in place. Maps to PUT /api/admin/config/sentry/org.
function OrgField({ org, setOrg, token, onLogout }) {
  const [value, setValue] = useState(org)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  async function save(next) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/sentry/org`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ org: next }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the organization')
      setOrg(data.org)
      setValue(data.org)
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    save(value.trim())
  }

  return (
    <section className="admin__section card">
      <h2 className="admin__section-title">Organization</h2>
      <p className="admin__muted">
        The slug of your Sentry organization (<code>sentry.io/organizations/&lt;org&gt;/</code>).
      </p>

      {saveError && <p className="alert alert--error">{saveError}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type="text"
          placeholder="my-org"
          autoComplete="off"
          value={value}
          onChange={event => setValue(event.target.value)}
          disabled={saving}
        />
        <button className="btn btn--primary" type="submit" disabled={saving || value.trim() === org}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!saveError && savedAt && <span className="admin__saved">Saved</span>}
      </form>
    </section>
  )
}

// The auth token is write-only: a password input plus Save and (when set)
// Remove. Maps to PUT /api/admin/config/sentry/auth-token.
function TokenField({ configured, setConfigured, token, onLogout }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  async function save(next) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/sentry/auth-token`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token: next }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the auth token')
      setConfigured(data.tokenConfigured)
      setValue('')
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!value.trim()) return
    save(value.trim())
  }

  return (
    <section className="admin__section card">
      <h2 className="admin__section-title">Auth token</h2>
      <p className="admin__muted">Used to call the Sentry API. Stored write-only and never shown again.</p>

      <p className="admin__muted">
        Status:{' '}
        {configured ? (
          <span className="badge badge--success">configured</span>
        ) : (
          <span className="badge">not configured</span>
        )}
      </p>

      {saveError && <p className="alert alert--error">{saveError}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type="password"
          placeholder={configured ? 'Paste a new token to replace it' : 'Auth token'}
          autoComplete="off"
          value={value}
          onChange={event => setValue(event.target.value)}
          disabled={saving}
        />
        <button className="btn btn--primary" type="submit" disabled={saving || !value.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {configured && (
          <button className="btn btn--secondary" type="button" onClick={() => save('')} disabled={saving}>
            Remove
          </button>
        )}
        {!saveError && savedAt && <span className="admin__saved">Saved</span>}
      </form>
    </section>
  )
}
