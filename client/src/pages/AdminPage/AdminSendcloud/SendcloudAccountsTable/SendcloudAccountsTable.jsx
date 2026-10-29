import { removeSendcloudAccount } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { formatDate } from '../../dates.js'

export default function SendcloudAccountsTable({ token, accounts, onLogout, onRemoved }) {
  const { saving, error, save } = useSaveField(onLogout)

  function handleRemove(account) {
    save(async () => {
      await removeSendcloudAccount(token, account.id)
      onRemoved()
    })
  }

  if (accounts.length === 0) return <p className="admin__muted">No Sendcloud account is linked yet.</p>

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Linked</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {accounts.map(account => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{formatDate(account.createdAt)}</td>
                <td>
                  <button
                    className="btn btn--secondary btn--sm"
                    type="button"
                    onClick={() => handleRemove(account)}
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
    </>
  )
}
