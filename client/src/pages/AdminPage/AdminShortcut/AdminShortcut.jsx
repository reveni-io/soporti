import { useEffect, useState } from 'react'
import { getShortcutConfig, isUnauthorized, saveShortcutToken } from '../../../services/services.js'

export default function AdminShortcut({ token, onLogout }) {
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [shortcutToken, setShortcutToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getShortcutConfig(token)
        if (!active) return
        setTokenConfigured(data.tokenConfigured)
      } catch (err) {
        if (isUnauthorized(err)) {
          onLogout?.()
          return
        }
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
      const data = await saveShortcutToken(token, value)
      setTokenConfigured(data.tokenConfigured)
      setShortcutToken('')
      setSavedAt(Date.now())
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!shortcutToken.trim()) return
    saveToken(shortcutToken.trim())
  }

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Shortcut</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Shortcut</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Shortcut integration</h2>
        <p className="admin__muted">
          Lets the assistant look up Shortcut stories (user stories, bugs, chores) by ID or search, and lets PR reviews
          fetch the story a pull request references as its spec. The token is stored in the database and never shown
          again after saving.
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
            In Shortcut, open <strong>Settings → Your Account → API Tokens</strong>.
          </li>
          <li>
            Give the token a name (e.g. <code>soporti</code>) and click <strong>Generate Token</strong>.
          </li>
          <li>
            The token inherits the permissions of the account that creates it — consider a dedicated read-only member
            account if you want to limit access.
          </li>
          <li>Paste the token below. It is stored write-only and never shown again.</li>
        </ol>

        {saveError && <p className="alert alert--error">{saveError}</p>}

        <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
          <input
            className="input"
            type="password"
            placeholder={tokenConfigured ? 'Paste a new token to replace it' : 'Shortcut API token'}
            autoComplete="off"
            value={shortcutToken}
            onChange={event => setShortcutToken(event.target.value)}
            disabled={saving}
          />
          <button className="btn btn--primary" type="submit" disabled={saving || !shortcutToken.trim()}>
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
