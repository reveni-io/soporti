import { useEffect, useState } from 'react'

// GitHub settings section of the admin panel. The token is write-only (the
// server never returns it) and the repository catalog is free text injected
// into the agent prompt so it can pick the right repo for each question.
export default function AdminGithub({ token, onLogout }) {
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [ghToken, setGhToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)
  const [tokenError, setTokenError] = useState(null)
  const [tokenSavedAt, setTokenSavedAt] = useState(null)

  const [secretConfigured, setSecretConfigured] = useState(false)
  const [webhookSecret, setWebhookSecret] = useState('')
  const [savingSecret, setSavingSecret] = useState(false)
  const [secretError, setSecretError] = useState(null)
  const [secretSavedAt, setSecretSavedAt] = useState(null)

  const [catalog, setCatalog] = useState('')
  const [initialCatalog, setInitialCatalog] = useState('')
  const [savingCatalog, setSavingCatalog] = useState(false)
  const [catalogError, setCatalogError] = useState(null)
  const [catalogSavedAt, setCatalogSavedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/github`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the GitHub settings')
        const data = await res.json()
        if (!active) return
        setTokenConfigured(data.tokenConfigured)
        setSecretConfigured(data.webhookSecretConfigured)
        setCatalog(data.repoCatalog)
        setInitialCatalog(data.repoCatalog)
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
    setSavingToken(true)
    setTokenError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/github/token`, {
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
      setGhToken('')
      setTokenSavedAt(Date.now())
    } catch (err) {
      setTokenError(err.message)
    } finally {
      setSavingToken(false)
    }
  }

  function handleTokenSubmit(event) {
    event.preventDefault()
    if (!ghToken.trim()) return
    saveToken(ghToken.trim())
  }

  async function saveSecret(value) {
    setSavingSecret(true)
    setSecretError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/github/webhook-secret`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ secret: value }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the webhook secret')
      setSecretConfigured(data.webhookSecretConfigured)
      setWebhookSecret('')
      setSecretSavedAt(Date.now())
    } catch (err) {
      setSecretError(err.message)
    } finally {
      setSavingSecret(false)
    }
  }

  function handleSecretSubmit(event) {
    event.preventDefault()
    if (!webhookSecret.trim()) return
    saveSecret(webhookSecret.trim())
  }

  function generateSecret() {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    setWebhookSecret(Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''))
  }

  async function handleCatalogSave() {
    setSavingCatalog(true)
    setCatalogError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/github/catalog`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ catalog }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the catalog')
      setCatalog(data.repoCatalog)
      setInitialCatalog(data.repoCatalog)
      setCatalogSavedAt(Date.now())
    } catch (err) {
      setCatalogError(err.message)
    } finally {
      setSavingCatalog(false)
    }
  }

  const catalogDirty = catalog !== initialCatalog

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">GitHub</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">GitHub</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">GitHub token</h2>
        <p className="admin__muted">
          Personal access token used by every GitHub feature: repository tools, clones and PR reviews. It is stored in
          the database and never shown again after saving.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {tokenConfigured ? (
            <span className="badge badge--success">configured</span>
          ) : (
            <span className="badge">not configured</span>
          )}
        </p>

        {tokenError && <p className="alert alert--error">{tokenError}</p>}

        <form className="admin__form admin__form--row" onSubmit={handleTokenSubmit}>
          <input
            className="input"
            type="password"
            placeholder={tokenConfigured ? 'Paste a new token to replace it' : 'ghp_...'}
            autoComplete="off"
            value={ghToken}
            onChange={event => setGhToken(event.target.value)}
            disabled={savingToken}
          />
          <button className="btn btn--primary" type="submit" disabled={savingToken || !ghToken.trim()}>
            {savingToken ? 'Saving...' : 'Save token'}
          </button>
          {tokenConfigured && (
            <button className="btn btn--secondary" type="button" onClick={() => saveToken('')} disabled={savingToken}>
              Remove
            </button>
          )}
          {!tokenError && tokenSavedAt && <span className="admin__saved">Saved</span>}
        </form>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Pull request reviews</h2>
        <p className="admin__muted">
          Soporti reviews PRs when someone requests its review or adds the review label. Deliveries are authenticated
          with a shared webhook secret: generate one below and use the same value when creating the webhook in GitHub
          (Org Settings → Webhooks) with this configuration:
        </p>

        <dl className="admin__kv">
          <div className="admin__kv-row">
            <dt>Payload URL</dt>
            <dd>
              <code>{`${import.meta.env.VITE_API_URL || window.location.origin}/api/webhooks/github`}</code>
            </dd>
          </div>
          <div className="admin__kv-row">
            <dt>Content type</dt>
            <dd>
              <code>application/json</code>
            </dd>
          </div>
          <div className="admin__kv-row">
            <dt>Secret</dt>
            <dd>the value you save below</dd>
          </div>
          <div className="admin__kv-row">
            <dt>Events</dt>
            <dd>Pull requests · Issue comments · Pull request review comments</dd>
          </div>
        </dl>

        <p className="admin__muted">
          Status:{' '}
          {secretConfigured ? (
            <span className="badge badge--success">enabled</span>
          ) : (
            <span className="badge">disabled</span>
          )}
        </p>

        {secretError && <p className="alert alert--error">{secretError}</p>}

        <form className="admin__form admin__form--row" onSubmit={handleSecretSubmit}>
          <input
            className="input"
            type="text"
            placeholder={secretConfigured ? 'Paste a new secret to rotate it' : 'Webhook secret'}
            autoComplete="off"
            value={webhookSecret}
            onChange={event => setWebhookSecret(event.target.value)}
            disabled={savingSecret}
          />
          <button className="btn btn--secondary" type="button" onClick={generateSecret} disabled={savingSecret}>
            Generate
          </button>
          <button className="btn btn--primary" type="submit" disabled={savingSecret || !webhookSecret.trim()}>
            {savingSecret ? 'Saving...' : 'Save secret'}
          </button>
          {secretConfigured && (
            <button className="btn btn--secondary" type="button" onClick={() => saveSecret('')} disabled={savingSecret}>
              Disable
            </button>
          )}
          {!secretError && secretSavedAt && <span className="admin__saved">Saved</span>}
        </form>
        <p className="admin__muted">
          Copy the secret into GitHub before saving — it is stored write-only and cannot be shown again.
        </p>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Repository catalog</h2>
        <p className="admin__muted">
          Free text describing what each repository covers. It is injected into the agent prompt so it can pick the most
          relevant repo(s) for a question before calling tools. Markdown works well (e.g. one <code>### org/repo</code>{' '}
          heading per repo followed by a short summary).
        </p>

        {catalogError && <p className="alert alert--error">{catalogError}</p>}

        <textarea
          className="textarea textarea--code"
          placeholder={'### org/backend (Python)\nThe backend: payments, auth, webhooks...'}
          value={catalog}
          onChange={event => setCatalog(event.target.value)}
          disabled={savingCatalog}
          rows={16}
        />

        <div className="admin__form admin__form--row">
          <span className="admin__muted">{catalog.length.toLocaleString()} / 100,000 characters</span>
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleCatalogSave}
            disabled={!catalogDirty || savingCatalog}
          >
            {savingCatalog ? 'Saving...' : 'Save catalog'}
          </button>
          {!catalogError && catalogSavedAt && !catalogDirty && <span className="admin__saved">Saved</span>}
        </div>
      </section>
    </>
  )
}
