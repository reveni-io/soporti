import { useEffect, useState } from 'react'

export default function AdminOpenAI({ token, onLogout }) {
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState(null)
  const [keySavedAt, setKeySavedAt] = useState(null)

  const [model, setModel] = useState('')
  const [initialModel, setInitialModel] = useState('')
  const [savingModel, setSavingModel] = useState(false)
  const [modelError, setModelError] = useState(null)
  const [modelSavedAt, setModelSavedAt] = useState(null)

  const [vectorStoreId, setVectorStoreId] = useState('')
  const [initialVectorStoreId, setInitialVectorStoreId] = useState('')
  const [savingVectorStore, setSavingVectorStore] = useState(false)
  const [vectorStoreError, setVectorStoreError] = useState(null)
  const [vectorStoreSavedAt, setVectorStoreSavedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/openai`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load the OpenAI settings')
        const data = await res.json()
        if (!active) return
        setApiKeyConfigured(data.apiKeyConfigured)
        setModel(data.model)
        setInitialModel(data.model)
        setVectorStoreId(data.vectorStoreId)
        setInitialVectorStoreId(data.vectorStoreId)
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

  async function saveApiKey(value) {
    setSavingKey(true)
    setKeyError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/openai/api-key`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey: value }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the API key')
      setApiKeyConfigured(data.apiKeyConfigured)
      setApiKey('')
      setKeySavedAt(Date.now())
    } catch (err) {
      setKeyError(err.message)
    } finally {
      setSavingKey(false)
    }
  }

  function handleApiKeySubmit(event) {
    event.preventDefault()
    if (!apiKey.trim()) return
    saveApiKey(apiKey.trim())
  }

  async function handleModelSave() {
    setSavingModel(true)
    setModelError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/openai/model`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ model }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the model')
      setModel(data.model)
      setInitialModel(data.model)
      setModelSavedAt(Date.now())
    } catch (err) {
      setModelError(err.message)
    } finally {
      setSavingModel(false)
    }
  }

  async function handleVectorStoreSave() {
    setSavingVectorStore(true)
    setVectorStoreError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/config/openai/vector-store`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vectorStoreId }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save the vector store id')
      setVectorStoreId(data.vectorStoreId)
      setInitialVectorStoreId(data.vectorStoreId)
      setVectorStoreSavedAt(Date.now())
    } catch (err) {
      setVectorStoreError(err.message)
    } finally {
      setSavingVectorStore(false)
    }
  }

  const modelDirty = model !== initialModel
  const vectorStoreDirty = vectorStoreId !== initialVectorStoreId

  if (loading) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">OpenAI</h2>
        <p className="admin__muted">Loading...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin__section card">
        <h2 className="admin__section-title">OpenAI</h2>
        <p className="alert alert--error">{error}</p>
      </section>
    )
  }

  return (
    <>
      <section className="admin__section card">
        <h2 className="admin__section-title">OpenAI API key</h2>
        <p className="admin__muted">
          API key used by the assistant, the PR-review agents and the knowledge base. It is stored in the database and
          never shown again after saving.
        </p>

        <p className="admin__muted">
          Status:{' '}
          {apiKeyConfigured ? (
            <span className="badge badge--success">configured</span>
          ) : (
            <span className="badge">not configured</span>
          )}
        </p>

        {keyError && <p className="alert alert--error">{keyError}</p>}

        <form className="admin__form admin__form--row" onSubmit={handleApiKeySubmit}>
          <input
            className="input"
            type="password"
            placeholder={apiKeyConfigured ? 'Paste a new key to replace it' : 'sk-...'}
            autoComplete="off"
            value={apiKey}
            onChange={event => setApiKey(event.target.value)}
            disabled={savingKey}
          />
          <button className="btn btn--primary" type="submit" disabled={savingKey || !apiKey.trim()}>
            {savingKey ? 'Saving...' : 'Save key'}
          </button>
          {apiKeyConfigured && (
            <button className="btn btn--secondary" type="button" onClick={() => saveApiKey('')} disabled={savingKey}>
              Remove
            </button>
          )}
          {!keyError && keySavedAt && <span className="admin__saved">Saved</span>}
        </form>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Model</h2>
        <p className="admin__muted">
          The chat and review model. Required — there is no default, so the assistant stays disabled until you set one.
          Any model available to your API key works (e.g. <code>gpt-4o</code>, <code>gpt-5.2-codex</code>).
        </p>

        {modelError && <p className="alert alert--error">{modelError}</p>}

        <div className="admin__form admin__form--row">
          <input
            className="input"
            type="text"
            placeholder="gpt-4o"
            autoComplete="off"
            value={model}
            onChange={event => setModel(event.target.value)}
            disabled={savingModel}
          />
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleModelSave}
            disabled={!modelDirty || savingModel}
          >
            {savingModel ? 'Saving...' : 'Save model'}
          </button>
          {!modelError && modelSavedAt && !modelDirty && <span className="admin__saved">Saved</span>}
        </div>
      </section>

      <section className="admin__section card">
        <h2 className="admin__section-title">Knowledge base vector store</h2>
        <p className="admin__muted">
          OpenAI vector store id used to surface similar solved cases. Optional — leave empty to disable the knowledge
          base. Create one at{' '}
          <a
            className="admin__link"
            href="https://platform.openai.com/storage/vector-stores"
            target="_blank"
            rel="noreferrer"
          >
            platform.openai.com
          </a>
          .
        </p>

        {vectorStoreError && <p className="alert alert--error">{vectorStoreError}</p>}

        <div className="admin__form admin__form--row">
          <input
            className="input"
            type="text"
            placeholder="vs_..."
            autoComplete="off"
            value={vectorStoreId}
            onChange={event => setVectorStoreId(event.target.value)}
            disabled={savingVectorStore}
          />
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleVectorStoreSave}
            disabled={!vectorStoreDirty || savingVectorStore}
          >
            {savingVectorStore ? 'Saving...' : 'Save'}
          </button>
          {!vectorStoreError && vectorStoreSavedAt && !vectorStoreDirty && <span className="admin__saved">Saved</span>}
        </div>
      </section>
    </>
  )
}
