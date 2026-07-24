import { useEffect, useState } from 'react'

export default function AdminShopify({ token, onLogout }) {
  const [tokenQuery, setTokenQuery] = useState('')
  const [initialTokenQuery, setInitialTokenQuery] = useState('')
  const [tokenQueryConfigured, setTokenQueryConfigured] = useState(false)
  const [databaseConfigured, setDatabaseConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [drafting, setDrafting] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/shopify`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the Shopify settings')
        const data = await res.json()
        if (!active) return
        setTokenQueryConfigured(data.tokenQueryConfigured)
        setTokenQuery(data.tokenQuery)
        setInitialTokenQuery(data.tokenQuery)
        setDatabaseConfigured(data.databaseConfigured)
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

  async function saveTokenQuery(value) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/shopify/token-query`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tokenQuery: value }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the token query')
      setTokenQueryConfigured(data.tokenQueryConfigured)
      const saved = data.tokenQueryConfigured ? value.trim() : ''
      setTokenQuery(saved)
      setInitialTokenQuery(saved)
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function draftQuery() {
    setDrafting(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/shopify/draft-token-query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to draft the token query')
      setTokenQuery(data.query)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setDrafting(false)
    }
  }

  const dirty = tokenQuery !== initialTokenQuery

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Shopify</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Shopify</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Shopify integration</h2>
        <p className="admin__muted">
          Lets the assistant query the Shopify Admin API (read-only): orders, products, webhooks and GraphQL lookups. It
          has no credentials of its own: it works when the Database integration is connected and your Shopify store
          tokens live in that database — the assistant looks them up per store with the query below. Saving a query
          enables the integration; removing it disables it.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {tokenQueryConfigured && databaseConfigured ? (
            <span className="badge badge--success">configured</span>
          ) : (
            <span className="badge">not configured</span>
          )}
        </p>

        {!databaseConfigured && (
          <p className="alert alert--warning">
            The Shopify integration needs the Database integration: configure the read-only connection in the Database
            section. The token query below runs against that database.
          </p>
        )}
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Store token query</h2>
        <p className="admin__muted">
          SQL that resolves a store to its Shopify Admin API credentials. Every occurrence of <code>{'{{store}}'}</code>{' '}
          is replaced with the store identifier the assistant was given (a domain or an ID), safely quoted as a string
          literal. The query must be a read-only <code>SELECT</code> returning one row with a <code>domain</code> column
          (the <code>*.myshopify.com</code> domain) and a <code>token</code> column (the Admin API access token).
        </p>
        <p className="admin__muted">
          Don&apos;t write it by hand: <strong>Draft with Soporti</strong> lets the assistant explore the database
          schema (table and column names only — it never reads token values) and fill in the query for you to review and
          save.
        </p>

        {saveError && <p className="alert alert--error">{saveError}</p>}

        <textarea
          className="textarea textarea--code"
          placeholder={
            "SELECT domain, token\nFROM shopify_stores\nWHERE domain ILIKE '%' || {{store}} || '%' OR id::text = {{store}}\nLIMIT 1"
          }
          value={tokenQuery}
          onChange={event => setTokenQuery(event.target.value)}
          disabled={saving || drafting}
          rows={8}
        />

        <div className="admin__form admin__form--row">
          <button
            className="btn btn--secondary"
            type="button"
            onClick={draftQuery}
            disabled={!databaseConfigured || drafting || saving}
            title={databaseConfigured ? undefined : 'Configure the Database integration first'}
          >
            {drafting ? 'Soporti is exploring the database...' : 'Draft with Soporti'}
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => saveTokenQuery(tokenQuery)}
            disabled={!dirty || saving || drafting || !tokenQuery.trim()}
          >
            {saving ? 'Saving...' : 'Save query'}
          </button>
          {tokenQueryConfigured && (
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => saveTokenQuery('')}
              disabled={saving || drafting}
            >
              Remove
            </button>
          )}
          {!saveError && savedAt && !dirty && <span className="admin__saved">Saved</span>}
        </div>
      </section>
    </>
  )
}
