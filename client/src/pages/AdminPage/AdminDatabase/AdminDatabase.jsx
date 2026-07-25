import { getDatabaseConfig, saveDatabaseConnection, saveDatabaseMaxRows } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

export default function AdminDatabase({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getDatabaseConfig, token, onLogout)

  async function saveConnection(value) {
    const data = await saveDatabaseConnection(token, value)
    patchConfig({ connectionConfigured: data.connectionConfigured })
  }

  async function saveMaxRows(value) {
    const data = await saveDatabaseMaxRows(token, value === '' ? '' : Number(value))
    patchConfig({ maxRows: data.maxRows })
  }

  if (error || !config) return <AdminSectionStatus title="Database" error={error} />

  return (
    <>
      <AdminSection title="Database integration">
        <p className="admin__muted">
          Lets the assistant explore and run read-only queries against a PostgreSQL database. Only SELECT and WITH
          queries are allowed, and results are capped at the configurable row limit below. This is the customer
          database, not the app&apos;s own database. The connection string is stored in the database and never shown
          again after saving.
        </p>

        <StatusRow configured={config.connectionConfigured} />
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            Use a <strong>read-only</strong> database user — the tool only allows SELECT/WITH queries, but least
            privilege is the safe default.
          </li>
          <li>
            Paste a PostgreSQL connection string in URL form (<code>postgresql://user:password@host:port/dbname</code>)
            or libpq key-value form. Add <code>?sslmode=require</code> if your provider needs TLS.
          </li>
          <li>It is stored write-only and never shown again.</li>
        </ol>

        <SecretField
          placeholder="postgresql://..."
          configuredPlaceholder="Paste a new connection string to replace it"
          configured={config.connectionConfigured}
          onSave={saveConnection}
          onLogout={onLogout}
          saveLabel="Save connection"
        />
      </AdminSection>

      <AdminSection title="Row limit">
        <p className="admin__muted">
          Maximum number of rows a single query returns. Keeps large result sets from overflowing the assistant&apos;s
          context. Leave empty to reset to the default (100). A very high value can overflow that context.
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
