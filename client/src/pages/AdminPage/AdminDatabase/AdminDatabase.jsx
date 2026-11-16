import { getDatabaseConfig, saveDatabaseMaxRows } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'
import DatabaseConnection from './DatabaseConnection/DatabaseConnection.jsx'
import DatabaseConnectionForm from './DatabaseConnectionForm/DatabaseConnectionForm.jsx'

export default function AdminDatabase({ token, onLogout }) {
  const { config, error, patchConfig, reload } = useAuthedConfig(getDatabaseConfig, token, onLogout)

  async function saveMaxRows(value) {
    const data = await saveDatabaseMaxRows(token, value === '' ? '' : Number(value))
    patchConfig({ maxRows: data.maxRows })
  }

  if (error || !config) return <AdminSectionStatus title="Database" error={error} />

  return (
    <>
      <AdminSection title="Database integration">
        <p className="admin__muted">
          Lets the assistant explore and run read-only queries against one or more PostgreSQL databases — production, a
          replica, the billing database — each under a name the team recognizes. Only SELECT and WITH queries are
          allowed, and results are capped at the row limit below. These are customer databases, not the app&apos;s own
          database. Connection strings are stored in the database and never shown again after saving.
        </p>

        <StatusRow configured={config.connections.length > 0} />
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            Use a <strong>read-only</strong> database user for each connection — the tool only allows SELECT/WITH
            queries, but least privilege is the safe default.
          </li>
          <li>
            Paste a PostgreSQL connection string in URL form (<code>postgresql://user:password@host:port/dbname</code>)
            or libpq key-value form. Add <code>?sslmode=require</code> if your provider needs TLS.
          </li>
          <li>
            Give it a name the team recognizes, like <strong>production</strong> or <strong>billing</strong>. The
            assistant asks for a database by that name when several are connected, and Analytics shows which one each
            chart reads from.
          </li>
          <li>
            The connection string is stored write-only and never shown again. To rotate it, paste the new one into that
            connection below.
          </li>
        </ol>
      </AdminSection>

      <AdminSection title="Connections">
        <ConnectionList token={token} connections={config.connections} onLogout={onLogout} onChanged={reload} />
      </AdminSection>

      <AdminSection title="Add a connection">
        <DatabaseConnectionForm token={token} onLogout={onLogout} onAdded={reload} />
      </AdminSection>

      <AdminSection title="Row limit">
        <p className="admin__muted">
          Maximum number of rows a single query returns, on every connection. Keeps large result sets from overflowing
          the assistant&apos;s context. Leave empty to reset to the default (100). A very high value can overflow that
          context.
        </p>

        <ValueField
          savedValue={String(config.maxRows ?? '')}
          onSave={saveMaxRows}
          onLogout={onLogout}
          type="number"
          min="1"
          step="1"
          placeholder="100"
          saveLabel="Save limit"
        />
      </AdminSection>
    </>
  )
}

function ConnectionList({ token, connections, onLogout, onChanged }) {
  if (connections.length === 0) return <p className="admin__muted">No database is connected yet.</p>

  return (
    <ul className="database-connections">
      {connections.map(connection => (
        <DatabaseConnection
          key={connection.id}
          token={token}
          connection={connection}
          onLogout={onLogout}
          onChanged={onChanged}
        />
      ))}
    </ul>
  )
}
