import { useEffect, useState } from 'react'

export default function AdminSlack({ token, onLogout }) {
  const [botTokenConfigured, setBotTokenConfigured] = useState(false)
  const [appTokenConfigured, setAppTokenConfigured] = useState(false)
  const [signingSecretConfigured, setSigningSecretConfigured] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/slack`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the Slack settings')
        const data = await res.json()
        if (!active) return
        setBotTokenConfigured(data.botTokenConfigured)
        setAppTokenConfigured(data.appTokenConfigured)
        setSigningSecretConfigured(data.signingSecretConfigured)
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
        <h2 className="admin__section-title">Slack</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">Slack</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  const connected = botTokenConfigured && appTokenConfigured

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">Slack integration</h2>
        <p className="admin__muted">
          Lets the assistant answer questions in Slack — @-mentions in channels and direct messages — over a Socket Mode
          connection. The credentials are stored in the database and never shown again after saving. Saving any of them
          reconnects the bot immediately; no server restart is needed.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {connected ? (
            <span className="badge badge--success">connected</span>
          ) : (
            <span className="badge">not configured</span>
          )}
        </p>
        <p className="admin__muted">The bot connects once both the bot token and the app token are set.</p>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Setup</h2>
        <ol className="admin__steps">
          <li>
            Create a Slack app at <strong>api.slack.com/apps</strong> and enable <strong>Socket Mode</strong>.
          </li>
          <li>
            Add the bot scopes <code>app_mentions:read</code>, <code>chat:write</code>, <code>channels:history</code>,{' '}
            <code>im:history</code>, <code>im:read</code> (for auto-diagnose also <code>lists:read</code>,{' '}
            <code>lists:write</code>, <code>files:read</code>) and install the app to the workspace.
          </li>
          <li>
            Subscribe to the bot events <code>app_mention</code> and <code>message.im</code>.
          </li>
          <li>
            Paste the <strong>Bot User OAuth Token</strong> (<code>xoxb-</code>) and an <strong>App-Level Token</strong>{' '}
            (<code>xapp-</code>, with <code>connections:write</code>) below.
          </li>
        </ol>
      </section>

      <SecretField
        title="Bot token"
        description="Bot User OAuth Token used for all Web API calls (starts with xoxb-)."
        endpoint="bot-token"
        bodyKey="token"
        responseKey="botTokenConfigured"
        placeholder="xoxb-..."
        configured={botTokenConfigured}
        setConfigured={setBotTokenConfigured}
        token={token}
        onLogout={onLogout}
      />

      <SecretField
        title="App token"
        description="App-Level Token used to open the Socket Mode connection (starts with xapp-)."
        endpoint="app-token"
        bodyKey="token"
        responseKey="appTokenConfigured"
        placeholder="xapp-..."
        configured={appTokenConfigured}
        setConfigured={setAppTokenConfigured}
        token={token}
        onLogout={onLogout}
      />

      <SecretField
        title="Signing secret"
        description="Optional in Socket Mode. Stored for completeness / future HTTP mode."
        endpoint="signing-secret"
        bodyKey="secret"
        responseKey="signingSecretConfigured"
        placeholder="Signing secret"
        configured={signingSecretConfigured}
        setConfigured={setSigningSecretConfigured}
        token={token}
        onLogout={onLogout}
      />
    </>
  )
}

function SecretField({
  title,
  description,
  endpoint,
  bodyKey,
  responseKey,
  placeholder,
  configured,
  setConfigured,
  token,
  onLogout,
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  async function save(next) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/slack/${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [bodyKey]: next }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setConfigured(data[responseKey])
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
      <h2 className="admin__section-title">{title}</h2>
      <p className="admin__muted">{description}</p>

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
          placeholder={configured ? 'Paste a new value to replace it' : placeholder}
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
