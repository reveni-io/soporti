import { useEffect, useState } from 'react'

export default function AdminHelpjuice({ token, onLogout }) {
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [account, setAccount] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/helpjuice`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the Helpjuice settings')
        const data = await res.json()
        if (!active) return
        setApiKeyConfigured(data.apiKeyConfigured)
        setAccount(data.account)
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
        <h2 className="admin__section-title">Helpjuice</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Helpjuice</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  const configured = apiKeyConfigured && Boolean(account)

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Helpjuice integration</h2>
        <p className="admin__muted">
          Lets the assistant search and read articles from the Helpjuice help center. Both values are stored in the
          database; the API key is never shown again after saving.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {configured ? (
            <span className="badge badge--success">configured</span>
          ) : (
            <span className="badge">not configured</span>
          )}
        </p>
        <p className="admin__muted">The integration is enabled once both the account and the API key are set.</p>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Setup</h2>
        <ol className="admin__steps">
          <li>
            Your <strong>account</strong> is the subdomain of your help center: the <code>example</code> in{' '}
            <code>example.helpjuice.com</code>.
          </li>
          <li>
            In Helpjuice, open <strong>Settings → Integrations → API</strong> and copy your <strong>API key</strong>.
          </li>
          <li>Save both values below. The API key is stored write-only and never shown again.</li>
        </ol>
      </section>

      <AccountField account={account} setAccount={setAccount} token={token} onLogout={onLogout} />

      <ApiKeyField
        configured={apiKeyConfigured}
        setConfigured={setApiKeyConfigured}
        token={token}
        onLogout={onLogout}
      />
    </>
  )
}

function AccountField({ account, setAccount, token, onLogout }) {
  const [value, setValue] = useState(account)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  async function save(next) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/helpjuice/account`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ account: next }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the account')
      setAccount(data.account)
      setValue(data.account)
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
      <h2 className="admin__section-title">Account</h2>
      <p className="admin__muted">
        The subdomain of your help center (<code>&lt;account&gt;.helpjuice.com</code>).
      </p>

      {saveError && <p className="alert alert--error">{saveError}</p>}

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <input
          className="input"
          type="text"
          placeholder="example"
          autoComplete="off"
          value={value}
          onChange={event => setValue(event.target.value)}
          disabled={saving}
        />
        <button className="btn btn--primary" type="submit" disabled={saving || value.trim() === account}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!saveError && savedAt && <span className="admin__saved">Saved</span>}
      </form>
    </section>
  )
}

function ApiKeyField({ configured, setConfigured, token, onLogout }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  async function save(next) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/helpjuice/api-key`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey: next }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the API key')
      setConfigured(data.apiKeyConfigured)
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
      <h2 className="admin__section-title">API key</h2>
      <p className="admin__muted">Used to call the Helpjuice API. Stored write-only and never shown again.</p>

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
          placeholder={configured ? 'Paste a new key to replace it' : 'API key'}
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
