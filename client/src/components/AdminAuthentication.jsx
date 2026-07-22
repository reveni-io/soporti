import { useEffect, useState } from 'react'

// Authentication section of the admin panel: per-method sign-in toggles and
// the Google domain restriction. The server enforces everything; the /login
// page reads GET /api/auth/methods to render only the enabled methods.
export default function AdminAuthentication({ token, onLogout }) {
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [passwordEnabled, setPasswordEnabled] = useState(true)
  const [savingMethods, setSavingMethods] = useState(false)
  const [methodsError, setMethodsError] = useState(null)

  const [googleClientId, setGoogleClientId] = useState('')
  const [initialGoogleClientId, setInitialGoogleClientId] = useState('')
  const [savingClientId, setSavingClientId] = useState(false)
  const [clientIdError, setClientIdError] = useState(null)
  const [clientIdSavedAt, setClientIdSavedAt] = useState(null)

  const [domains, setDomains] = useState([])
  const [initialDomains, setInitialDomains] = useState([])
  const [newDomain, setNewDomain] = useState('')
  const [savingDomains, setSavingDomains] = useState(false)
  const [domainsError, setDomainsError] = useState(null)
  const [domainsSavedAt, setDomainsSavedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/auth`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the authentication settings')
        const data = await res.json()
        if (!active) return
        setGoogleEnabled(data.googleEnabled)
        setPasswordEnabled(data.passwordEnabled)
        setGoogleClientId(data.googleClientId ?? '')
        setInitialGoogleClientId(data.googleClientId ?? '')
        setDomains(data.domains)
        setInitialDomains(data.domains)
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

  // Optimistic toggle; reverted if the save fails.
  async function toggleMethod(key) {
    const next = {
      googleEnabled: key === 'google' ? !googleEnabled : googleEnabled,
      passwordEnabled: key === 'password' ? !passwordEnabled : passwordEnabled,
    }
    setGoogleEnabled(next.googleEnabled)
    setPasswordEnabled(next.passwordEnabled)
    setSavingMethods(true)
    setMethodsError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/auth/methods`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(next),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setGoogleEnabled(data.googleEnabled)
      setPasswordEnabled(data.passwordEnabled)
    } catch (err) {
      // Revert the optimistic change.
      setGoogleEnabled(googleEnabled)
      setPasswordEnabled(passwordEnabled)
      setMethodsError(err.message)
    } finally {
      setSavingMethods(false)
    }
  }

  async function saveClientId(value) {
    setSavingClientId(true)
    setClientIdError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/auth/google-client-id`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ googleClientId: value }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setGoogleClientId(data.googleClientId)
      setInitialGoogleClientId(data.googleClientId)
      setClientIdSavedAt(Date.now())
    } catch (err) {
      setClientIdError(err.message)
    } finally {
      setSavingClientId(false)
    }
  }

  function handleClientIdSave(event) {
    event.preventDefault()
    saveClientId(googleClientId.trim())
  }

  function addDomain(event) {
    event.preventDefault()
    const domain = newDomain.trim().toLowerCase()
    if (!domain || domains.includes(domain)) {
      setNewDomain('')
      return
    }
    setDomains([...domains, domain])
    setNewDomain('')
  }

  function removeDomain(domain) {
    setDomains(domains.filter(d => d !== domain))
  }

  async function handleDomainsSave() {
    setSavingDomains(true)
    setDomainsError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/allowed-domains`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ domains }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setDomains(data.domains)
      setInitialDomains(data.domains)
      setDomainsSavedAt(Date.now())
    } catch (err) {
      setDomainsError(err.message)
    } finally {
      setSavingDomains(false)
    }
  }

  const domainsDirty = JSON.stringify(domains) !== JSON.stringify(initialDomains)
  const clientIdDirty = googleClientId.trim() !== initialGoogleClientId

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Sign-in methods</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Sign-in methods</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Sign-in methods</h2>
        <p className="admin__muted">Choose how users can sign in. The login page only shows the enabled methods.</p>

        {methodsError && <p className="alert alert--error">{methodsError}</p>}

        <label className="admin__switch">
          <input
            type="checkbox"
            checked={googleEnabled}
            onChange={() => toggleMethod('google')}
            disabled={savingMethods}
          />
          <span className="admin__switch-slider" aria-hidden="true" />
          <span className="admin__switch-label">
            Google sign-in
            <span className="admin__muted">One-click sign-in with a Google account.</span>
          </span>
        </label>

        <label className="admin__switch">
          <input
            type="checkbox"
            checked={passwordEnabled}
            onChange={() => toggleMethod('password')}
            disabled={savingMethods}
          />
          <span className="admin__switch-slider" aria-hidden="true" />
          <span className="admin__switch-label">
            Email &amp; password
            <span className="admin__muted">Accounts created by an admin in the Users section.</span>
          </span>
        </label>

        {!passwordEnabled && (
          <p className="note">
            The email &amp; password form is hidden on the login page. Admins can always sign in with their password at{' '}
            <code>/admin</code> — you cannot lock yourself out.
          </p>
        )}

        {!googleEnabled && !passwordEnabled && (
          <p className="alert alert--warning">
            Both methods are disabled: regular users cannot sign in at all. Only admins keep access (via{' '}
            <code>/admin</code>).
          </p>
        )}
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Google Client ID</h2>
        <p className="admin__muted">
          OAuth client id used to verify Google sign-ins. Create one in the Google Cloud Console (APIs &amp; Services →
          Credentials → OAuth client ID, type <em>Web application</em>). The frontend build also needs{' '}
          <code>VITE_GOOGLE_CLIENT_ID</code> set to this same value.
        </p>

        {clientIdError && <p className="alert alert--error">{clientIdError}</p>}

        {googleEnabled && !initialGoogleClientId && (
          <p className="alert alert--warning">
            Google sign-in is enabled but no client id is set — the Google button stays hidden until you save one.
          </p>
        )}

        <form className="admin__form admin__form--row" onSubmit={handleClientIdSave}>
          <input
            className="input"
            type="text"
            placeholder="xxxxx.apps.googleusercontent.com"
            autoComplete="off"
            value={googleClientId}
            onChange={event => setGoogleClientId(event.target.value)}
            disabled={savingClientId}
          />
          <button className="btn btn--primary" type="submit" disabled={!clientIdDirty || savingClientId}>
            {savingClientId ? 'Saving...' : 'Save'}
          </button>
          {initialGoogleClientId && (
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => saveClientId('')}
              disabled={savingClientId}
            >
              Remove
            </button>
          )}
          {!clientIdError && clientIdSavedAt && !clientIdDirty && <span className="admin__saved">Saved</span>}
        </form>
      </section>

      {googleEnabled && (
        <section className="admin__section card">
          <h2 className="admin__section-title">Google sign-in domains</h2>
          <p className="admin__muted">
            Restrict Google sign-in to specific email domains. Leave the list empty to allow any Google account.
          </p>

          {domainsError && <p className="alert alert--error">{domainsError}</p>}

          <div className="admin__chips">
            {domains.map(domain => (
              <span key={domain} className="chip">
                {domain}
                <button
                  className="admin__chip-remove"
                  onClick={() => removeDomain(domain)}
                  aria-label={`Remove ${domain}`}
                  disabled={savingDomains}
                >
                  &times;
                </button>
              </span>
            ))}
            {domains.length === 0 && <span className="admin__muted">No domains configured.</span>}
          </div>

          {domains.length === 0 && (
            <p className="alert alert--warning">
              No domain restriction: anyone with a Google account will be able to sign in.
            </p>
          )}

          <form className="admin__form admin__form--row" onSubmit={addDomain}>
            <input
              className="input"
              type="text"
              placeholder="example.com"
              value={newDomain}
              onChange={event => setNewDomain(event.target.value)}
              disabled={savingDomains}
            />
            <button className="btn btn--secondary" type="submit" disabled={savingDomains || !newDomain.trim()}>
              Add
            </button>
            <button
              className="btn btn--primary"
              type="button"
              onClick={handleDomainsSave}
              disabled={!domainsDirty || savingDomains}
            >
              {savingDomains ? 'Saving...' : 'Save'}
            </button>
            {!domainsError && domainsSavedAt && !domainsDirty && <span className="admin__saved">Saved</span>}
          </form>
        </section>
      )}
    </>
  )
}
