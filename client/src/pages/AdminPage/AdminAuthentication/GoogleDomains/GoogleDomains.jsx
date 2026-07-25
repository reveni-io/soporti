import { useState } from 'react'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'

export default function GoogleDomains({ savedDomains, onSave, onLogout }) {
  const [edited, setEdited] = useState(null)
  const [newDomain, setNewDomain] = useState('')
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const domains = edited ?? savedDomains
  const dirty = JSON.stringify(domains) !== JSON.stringify(savedDomains)

  function handleAdd(event) {
    event.preventDefault()
    const domain = newDomain.trim().toLowerCase()
    setNewDomain('')
    if (!domain || domains.includes(domain)) return

    setEdited([...domains, domain])
  }

  function handleRemove(domain) {
    setEdited(domains.filter(d => d !== domain))
  }

  function handleSave() {
    save(async () => {
      await onSave(domains)
      setEdited(null)
    })
  }

  return (
    <AdminSection title="Google sign-in domains">
      <p className="admin__muted">
        Restrict Google sign-in to specific email domains. Leave the list empty to allow any Google account.
      </p>

      {error && <p className="alert alert--error">{error}</p>}

      <div className="admin__chips">
        {domains.map(domain => (
          <span key={domain} className="chip">
            {domain}
            <button
              className="admin__chip-remove"
              onClick={() => handleRemove(domain)}
              aria-label={`Remove ${domain}`}
              disabled={saving}
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

      <form className="admin__form admin__form--row" onSubmit={handleAdd}>
        <input
          className="input"
          type="text"
          placeholder="example.com"
          value={newDomain}
          onChange={event => setNewDomain(event.target.value)}
          disabled={saving}
        />
        <button className="btn btn--secondary" type="submit" disabled={saving || !newDomain.trim()}>
          Add
        </button>
        <button className="btn btn--primary" type="button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
      </form>
    </AdminSection>
  )
}
