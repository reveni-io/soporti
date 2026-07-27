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
          Lets the assistant search and aggregate your application logs in Better Stack Telemetry. All four values are
          stored in the database; the API token and the connection password are never shown again after saving.
        </p>

        <StatusRow configured={configured} />
        <p className="admin__muted">
          The integration is enabled once the API token, the connect host, the username and the password are set.
        </p>
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            In Better Stack, open <strong>API tokens → Team-based tokens</strong>, pick your team and copy a{' '}
            <strong>Telemetry API token</strong>. The assistant uses it to discover your log sources.
          </li>
          <li>
            Then open <strong>Integrations → SQL API</strong> and click <strong>Connect</strong> on{' '}
            <strong>ClickHouse HTTP client</strong>. Select the teams the connection may read and click{' '}
            <strong>Create connection</strong>.
          </li>
          <li>
            The success banner shows the <strong>Host</strong>, the <strong>username</strong> and the{' '}
            <strong>password</strong>. Copy all three now — the password is only shown there, once.
          </li>
          <li>Save the four values below.</li>
        </ol>
      </AdminSection>

      <AdminSection title="API token">
        <p className="admin__muted">
          Telemetry API token, used to list your log sources. Stored write-only and never shown again.
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

      <AdminSection title="Connect host">
        <p className="admin__muted">
          The host from the connection banner, without the scheme (e.g.{' '}
          <code>eu-nbg-2-connect.betterstackdata.com</code>).
        </p>

        <ValueField
          savedValue={config.host}
          onSave={saveHost}
          onLogout={onLogout}
          placeholder="eu-nbg-2-connect.betterstackdata.com"
        />
      </AdminSection>

      <AdminSection title="Connection username">
        <p className="admin__muted">The username of the ClickHouse HTTP client connection.</p>

        <ValueField savedValue={config.username} onSave={saveUsername} onLogout={onLogout} placeholder="u123456" />
      </AdminSection>

      <AdminSection title="Connection password">
        <p className="admin__muted">
          The password of the ClickHouse HTTP client connection. Stored write-only and never shown again — if you lost
          it, create a new connection in Better Stack.
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
