import {
  getBetterstackConfig,
  saveBetterstackApiToken,
  saveBetterstackConnectHost,
  saveBetterstackConnectionUsername,
  saveBetterstackConnectionPassword,
} from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

export default function AdminBetterstack({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getBetterstackConfig, token, onLogout)

  async function saveApiToken(value) {
    const data = await saveBetterstackApiToken(token, value)
    patchConfig({ tokenConfigured: data.tokenConfigured })
  }

  async function saveHost(value) {
    const data = await saveBetterstackConnectHost(token, value)
    patchConfig({ host: data.host })
  }

  async function saveUsername(value) {
    const data = await saveBetterstackConnectionUsername(token, value)
    patchConfig({ username: data.username })
  }

  async function savePassword(value) {
    const data = await saveBetterstackConnectionPassword(token, value)
    patchConfig({ passwordConfigured: data.passwordConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="Better Stack" error={error} />

  const configured = config.tokenConfigured && config.passwordConfigured && Boolean(config.host && config.username)

  return (
    <>
      <AdminSection title="Better Stack integration">
        <p className="admin__muted">
          Lets the assistant search and aggregate your application logs in Better Stack Telemetry. Setup pulls from two
          places in Better Stack: an API token that lists your log sources, and an SQL connection that reads them. Both
          are stored in the database, and the token and the connection password are never shown again after saving.
        </p>

        <StatusRow configured={configured} />
        <p className="admin__muted">
          The integration is enabled once the API token and the whole SQL connection are set.
        </p>
      </AdminSection>

      <AdminSection title="API token">
        <p className="admin__muted">
          Open <strong>API tokens → Team-based tokens</strong>, pick your team and copy a{' '}
          <strong>Telemetry API token</strong>. It is only used to list your log sources and their retention — every
          query goes through the SQL connection below.
        </p>

        <StatusRow configured={config.tokenConfigured} />

        <SecretField
          placeholder="Telemetry API token"
          configuredPlaceholder="Paste a new token to replace it"
          configured={config.tokenConfigured}
          onSave={saveApiToken}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="SQL connection">
        <p className="admin__muted">
          Open <strong>Integrations → SQL API</strong>, click <strong>Connect</strong> on{' '}
          <strong>ClickHouse HTTP client</strong>, pick the teams the connection may read and click{' '}
          <strong>Create connection</strong>. The banner then shows the three values below at once — copy them before
          leaving it, the password is only shown there once.
        </p>

        <h3 className="admin__subsection-title">Host</h3>
        <p className="admin__muted">
          Without the scheme, e.g. <code>eu-nbg-2-connect.betterstackdata.com</code>.
        </p>

        <ValueField
          savedValue={config.host}
          onSave={saveHost}
          onLogout={onLogout}
          placeholder="eu-nbg-2-connect.betterstackdata.com"
        />

        <h3 className="admin__subsection-title">Username</h3>

        <ValueField savedValue={config.username} onSave={saveUsername} onLogout={onLogout} placeholder="u123456" />

        <h3 className="admin__subsection-title">Password</h3>
        <p className="admin__muted">
          Stored write-only and never shown again — if you lost it, create a new connection in Better Stack.
        </p>

        <StatusRow configured={config.passwordConfigured} />

        <SecretField
          placeholder="Connection password"
          configuredPlaceholder="Paste a new password to replace it"
          configured={config.passwordConfigured}
          onSave={savePassword}
          onLogout={onLogout}
        />
      </AdminSection>
    </>
  )
}
