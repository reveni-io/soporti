import { useState } from 'react'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import './AwsAccounts.css'

const EMPTY_DRAFT = { name: '', roleArn: '' }

export default function AwsAccounts({ savedAccounts, onSave, onLogout }) {
  const [edited, setEdited] = useState(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const accounts = edited ?? savedAccounts
  const dirty = JSON.stringify(accounts) !== JSON.stringify(savedAccounts)
  const draftName = draft.name.trim().toLowerCase()
  const canAdd = draftName.length > 0 && draft.roleArn.trim().length > 0

  function handleDraftChange(event) {
    setDraft({ ...draft, [event.target.name]: event.target.value })
  }

  function handleAdd(event) {
    event.preventDefault()
    if (!canAdd || accounts.some(account => account.name === draftName)) return

    setEdited([...accounts, { name: draftName, roleArn: draft.roleArn.trim() }])
    setDraft(EMPTY_DRAFT)
  }

  function handleRemove(name) {
    setEdited(accounts.filter(account => account.name !== name))
  }

  function handleSave() {
    save(async () => {
      await onSave(accounts)
      setEdited(null)
    })
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <AccountsTable accounts={accounts} saving={saving} onRemove={handleRemove} />

      <form className="admin__form admin__form--row aws-accounts__form" onSubmit={handleAdd}>
        <input
          className="input"
          name="name"
          aria-label="Account name"
          placeholder="prod"
          value={draft.name}
          onChange={handleDraftChange}
          disabled={saving}
        />
        <input
          className="input aws-accounts__role"
          name="roleArn"
          aria-label="Role ARN"
          placeholder="arn:aws:iam::123456789012:role/monitoring-reader"
          value={draft.roleArn}
          onChange={handleDraftChange}
          disabled={saving}
        />
        <button className="btn btn--secondary" type="submit" disabled={saving || !canAdd}>
          Add
        </button>
        <button className="btn btn--primary" type="button" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
      </form>
    </>
  )
}

function AccountsTable({ accounts, saving, onRemove }) {
  if (accounts.length === 0) {
    return <p className="admin__muted">No accounts — the assistant reads the account Soporti runs against.</p>
  }

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {accounts.map(account => (
            <tr key={account.name}>
              <td>{account.name}</td>
              <td>
                <code>{account.roleArn}</code>
              </td>
              <td>
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  onClick={() => onRemove(account.name)}
                  disabled={saving}
                  aria-label={`Remove ${account.name}`}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
