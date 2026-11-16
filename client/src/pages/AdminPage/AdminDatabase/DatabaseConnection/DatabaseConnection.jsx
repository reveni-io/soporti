import { removeDatabaseConnection, updateDatabaseConnection } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import DeleteControl from '../../../../common/DeleteControl/DeleteControl.jsx'
import SecretField from '../../SecretField/SecretField.jsx'
import ValueField from '../../ValueField/ValueField.jsx'
import { formatDate } from '../../dates.js'
import './DatabaseConnection.css'

export default function DatabaseConnection({ token, connection, onLogout, onChanged }) {
  const { saving, error, save } = useSaveField(onLogout)

  async function rename(name) {
    await updateDatabaseConnection(token, connection.id, { name })
    onChanged()
  }

  async function replace(connectionString) {
    await updateDatabaseConnection(token, connection.id, { connectionString })
  }

  function handleRemove() {
    save(async () => {
      await removeDatabaseConnection(token, connection.id)
      onChanged()
    })
  }

  return (
    <li className="database-connection">
      <div className="database-connection__header">
        <h3 className="database-connection__name">{connection.name}</h3>
        <span className="admin__muted">Added {formatDate(connection.createdAt)}</span>
        <DeleteControl
          label="Remove"
          question={`Remove ${connection.name}? Charts that read from it stop working.`}
          busy={saving}
          onDelete={handleRemove}
        />
      </div>

      {error && <p className="alert alert--error">{error}</p>}

      <ValueField
        savedValue={connection.name}
        onSave={rename}
        onLogout={onLogout}
        placeholder="Name"
        saveLabel="Rename"
      />
      <SecretField
        placeholder="Paste a new connection string to replace it"
        configured={false}
        onSave={replace}
        onLogout={onLogout}
        saveLabel="Replace"
      />
    </li>
  )
}
