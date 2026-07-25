import { getSlackConfig, saveSlackCredential } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'

export default function AdminSlack({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getSlackConfig, token, onLogout)

  function saveCredential({ endpoint, bodyKey, responseKey }) {
    return async function save(value) {
      const data = await saveSlackCredential(token, { endpoint, bodyKey, value })
      patchConfig({ [responseKey]: data[responseKey] })
    }
  }

  if (error || !config) return <AdminSectionStatus title="Slack" error={error} />

  const connected = config.botTokenConfigured && config.appTokenConfigured

  return (
    <>
      <AdminSection title="Slack integration">
        <p className="admin__muted">
          Lets the assistant answer questions in Slack — @-mentions in channels and direct messages — over a Socket Mode
          connection. The credentials are stored in the database and never shown again after saving. Saving any of them
          reconnects the bot immediately; no server restart is needed.
        </p>

        <StatusRow configured={connected} configuredLabel="connected" />
        <p className="admin__muted">The bot connects once both the bot token and the app token are set.</p>
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            Create a Slack app at <strong>api.slack.com/apps</strong> and enable <strong>Socket Mode</strong>.
          </li>
          <li>
            Add the bot scopes <code>app_mentions:read</code>, <code>chat:write</code>, <code>channels:history</code>,{' '}
            <code>im:history</code>, <code>im:read</code> (for auto-diagnose also <code>lists:read</code>,{' '}
            <code>lists:write</code>, <code>files:read</code>) and install the app to the workspace.
          </li>
          <li>
            Subscribe to the bot events <code>app_mention</code> and <code>message.im</code>.
          </li>
          <li>
            Paste the <strong>Bot User OAuth Token</strong> (<code>xoxb-</code>) and an <strong>App-Level Token</strong>{' '}
            (<code>xapp-</code>, with <code>connections:write</code>) below.
          </li>
        </ol>
      </AdminSection>

      <AdminSection title="Bot token">
        <p className="admin__muted">Bot User OAuth Token used for all Web API calls (starts with xoxb-).</p>

        <StatusRow configured={config.botTokenConfigured} />

        <SecretField
          placeholder="xoxb-..."
          configuredPlaceholder="Paste a new value to replace it"
          configured={config.botTokenConfigured}
          onSave={saveCredential({
            endpoint: 'bot-token',
            bodyKey: 'token',
            responseKey: 'botTokenConfigured',
          })}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="App token">
        <p className="admin__muted">App-Level Token used to open the Socket Mode connection (starts with xapp-).</p>

        <StatusRow configured={config.appTokenConfigured} />

        <SecretField
          placeholder="xapp-..."
          configuredPlaceholder="Paste a new value to replace it"
          configured={config.appTokenConfigured}
          onSave={saveCredential({
            endpoint: 'app-token',
            bodyKey: 'token',
            responseKey: 'appTokenConfigured',
          })}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="Signing secret">
        <p className="admin__muted">Optional in Socket Mode. Stored for completeness / future HTTP mode.</p>

        <StatusRow configured={config.signingSecretConfigured} />

        <SecretField
          placeholder="Signing secret"
          configuredPlaceholder="Paste a new value to replace it"
          configured={config.signingSecretConfigured}
          onSave={saveCredential({
            endpoint: 'signing-secret',
            bodyKey: 'secret',
            responseKey: 'signingSecretConfigured',
          })}
          onLogout={onLogout}
        />
      </AdminSection>
    </>
  )
}
