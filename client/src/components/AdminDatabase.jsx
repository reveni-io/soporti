import { useEffect, useState } from 'react'

// Database section of the admin panel. This is the read-only PostgreSQL
// connection the assistant uses to explore a customer database with its query
// tool — NOT the app's own database. The connection string carries a password,
// so it is write-only (the server never returns it); only whether it is
// configured is shown.
export default function AdminDatabase({ token, onLogout }) {
  const [connectionConfigured, setConnectionConfigured] = useState(false)
  const [connection, setConnection] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  const [maxRows, setMaxRows] = useState('')
  const [maxRowsCeiling, setMaxRowsCeiling] = useState(1000)
  const [savingMaxRows, setSavingMaxRows] = useState(false)
  const [maxRowsError, setMaxRowsError] = useState(null)
  const [maxRowsSavedAt, setMaxRowsSavedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/postgres`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the database settings')
        const data = await res.json()
        if (!active) return
        setConnectionConfigured(data.connectionConfigured)
        setMaxRows(String(data.maxRows ?? ''))
        if (data.maxRowsCeiling) setMaxRowsCeiling(data.maxRowsCeiling)
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

  async function saveConnection(value) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/postgres/connection`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ connection: value }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the connection string')
      setConnectionConfigured(data.connectionConfigured)
      setConnection('')
      setSavedAt(Date.now())
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!connection.trim()) return
    saveConnection(connection.trim())
  }

  async function handleMaxRowsSubmit(event) {
    event.preventDefault()
    setSavingMaxRows(true)
    setMaxRowsError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/postgres/max-rows`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ maxRows: maxRows === '' ? '' : Number(maxRows) }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the row limit')
      // The server echoes the effective (clamped/defaulted) value.
      setMaxRows(String(data.maxRows))
      setMaxRowsSavedAt(Date.now())
    } catch (err) {
      setMaxRowsError(err.message)
    } finally {
      setSavingMaxRows(false)
    }
  }

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Database</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Database</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Database integration</h2>
        <p className="admin__muted">
          Lets the assistant explore and run read-only queries against a PostgreSQL database. Only SELECT and WITH
          queries are allowed, and results are capped at the configurable row limit below. This is the customer
          database, not the app&apos;s own database. The connection string is stored in the database and never shown
          again after saving.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {connectionConfigured ? (
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
            Use a <strong>read-only</strong> database user — the tool only allows SELECT/WITH queries, but least
            privilege is the safe default.
          </li>
          <li>
            Paste a PostgreSQL connection string in URL form (<code>postgresql://user:password@host:port/dbname</code>)
            or libpq key-value form. Add <code>?sslmode=require</code> if your provider needs TLS.
          </li>
          <li>It is stored write-only and never shown again.</li>
        </ol>

        {saveError && <p className="alert alert--error">{saveError}</p>}

        <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
          <input
            className="input"
            type="password"
            placeholder={connectionConfigured ? 'Paste a new connection string to replace it' : 'postgresql://...'}
            autoComplete="off"
            value={connection}
            onChange={event => setConnection(event.target.value)}
            disabled={saving}
          />
          <button className="btn btn--primary" type="submit" disabled={saving || !connection.trim()}>
            {saving ? 'Saving...' : 'Save connection'}
          </button>
          {connectionConfigured && (
            <button className="btn btn--secondary" type="button" onClick={() => saveConnection('')} disabled={saving}>
              Remove
            </button>
          )}
          {!saveError && savedAt && <span className="admin__saved">Saved</span>}
        </form>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Row limit</h2>
        <p className="admin__muted">
          Maximum number of rows a single query returns. Keeps large result sets from overflowing the assistant&apos;s
          context. Leave empty to reset to the default (100). Capped at {maxRowsCeiling}.
        </p>

        {maxRowsError && <p className="alert alert--error">{maxRowsError}</p>}

        <form className="admin__form admin__form--row" onSubmit={handleMaxRowsSubmit}>
          <input
            className="input"
            type="number"
            min="1"
            max={maxRowsCeiling}
            step="1"
            placeholder="100"
            value={maxRows}
            onChange={event => setMaxRows(event.target.value)}
            disabled={savingMaxRows}
          />
          <button className="btn btn--primary" type="submit" disabled={savingMaxRows}>
            {savingMaxRows ? 'Saving...' : 'Save limit'}
          </button>
          {!maxRowsError && maxRowsSavedAt && <span className="admin__saved">Saved</span>}
        </form>
      </section>
    </>
  )
}
