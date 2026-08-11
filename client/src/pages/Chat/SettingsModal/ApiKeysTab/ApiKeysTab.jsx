import { useState } from 'react'
import { MAX_API_KEY_NAME_LENGTH } from '../../../../constants.js'
import { createApiKey, isUnauthorized, revokeApiKey } from '../../../../services/services.js'
import { useApiKeys } from '../../hooks/useApiKeys/useApiKeys.js'
import { describeScope, formatLastUsed } from './describe-api-key.js'
import './ApiKeysTab.css'

export default function ApiKeysTab({ token, onLogout, selectedSources }) {
  const { apiKeys, loading, error: loadError, reload } = useApiKeys(token, onLogout)
  const [name, setName] = useState('')
  const [scopeToSelection, setScopeToSelection] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [pendingRevokeId, setPendingRevokeId] = useState(null)

  const error = actionError ?? loadError
  const sources = selectedSources ?? []
  const canScopeToSelection = sources.length > 0
  const canCreate = name.trim().length > 0 && !creating

  async function handleCreate(event) {
    event.preventDefault()
    if (!canCreate) return

    setCreating(true)
    setActionError(null)
    setCreatedKey(null)
    try {
      const data = await createApiKey(token, { name: name.trim(), sources: scopeToSelection ? sources : [] })
      setCreatedKey(data.key)
      setName('')
      setScopeToSelection(false)
      await reload()
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setActionError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id) {
    setActionError(null)
    try {
      await revokeApiKey(token, id)
      setPendingRevokeId(null)
      await reload()
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setActionError(err.message)
    }
  }

  function handleCopy() {
    navigator.clipboard?.writeText(createdKey)
  }

  return (
    <div className="settings-modal__panel api-keys-tab">
      <p className="settings-modal__description">
        API keys let an external agent talk to Soporti without a browser session. Send the key as{' '}
        <code>Authorization: Bearer sop_…</code>. Every request runs as you, so the conversations it creates show up in
        your sidebar.
      </p>

      {createdKey && (
        <div className="note api-keys-tab__created">
          <p className="api-keys-tab__created-title">Copy this key now — it is never shown again.</p>
          <div className="api-keys-tab__created-row">
            <code className="api-keys-tab__secret">{createdKey}</code>
            <button className="btn btn--secondary btn--sm" onClick={handleCopy}>
              Copy
            </button>
          </div>
        </div>
      )}

      {loading && <p className="api-keys-tab__status">Loading…</p>}
      {error && <span className="settings-modal__error">{error}</span>}
      {!loading && !error && apiKeys.length === 0 && <p className="api-keys-tab__empty">No API keys yet.</p>}

      <ul className="api-keys-tab__list">
        {apiKeys.map(apiKey => (
          <li key={apiKey.id} className="api-keys-tab__item">
            <div className="api-keys-tab__item-info">
              <span className="api-keys-tab__item-name">{apiKey.name}</span>
              <code className="api-keys-tab__item-prefix">{apiKey.prefix}…</code>
              <span className="api-keys-tab__item-meta">
                {describeScope(apiKey.sources)} · {formatLastUsed(apiKey.lastUsedAt)}
              </span>
            </div>

            <div className="api-keys-tab__item-actions">
              {pendingRevokeId === apiKey.id ? (
                <>
                  <button className="btn btn--danger btn--sm" onClick={() => handleRevoke(apiKey.id)}>
                    Confirm
                  </button>
                  <button className="btn btn--secondary btn--sm" onClick={() => setPendingRevokeId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn btn--danger btn--sm" onClick={() => setPendingRevokeId(apiKey.id)}>
                  Revoke
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <form className="api-keys-tab__form" onSubmit={handleCreate}>
        <label className="api-keys-tab__label">
          Name
          <input
            className="input"
            type="text"
            placeholder="e.g. Claude Code on my laptop"
            value={name}
            onChange={event => setName(event.target.value)}
            maxLength={MAX_API_KEY_NAME_LENGTH}
          />
        </label>

        <label className="api-keys-tab__checkbox">
          <input
            type="checkbox"
            checked={scopeToSelection}
            onChange={event => setScopeToSelection(event.target.checked)}
            disabled={!canScopeToSelection}
          />
          Restrict to the sources selected in the sidebar
        </label>

        <span className="api-keys-tab__scope-hint">{scopeToSelection ? describeScope(sources) : 'All sources'}</span>

        <div className="modal__actions">
          <button className="btn btn--primary" type="submit" disabled={!canCreate}>
            {creating ? 'Creating...' : '+ New API key'}
          </button>
        </div>
      </form>
    </div>
  )
}
