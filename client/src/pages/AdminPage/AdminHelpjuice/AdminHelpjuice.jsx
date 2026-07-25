import { getHelpjuiceConfig, saveHelpjuiceAccount, saveHelpjuiceApiKey } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

export default function AdminHelpjuice({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getHelpjuiceConfig, token, onLogout)

  async function saveAccount(value) {
    const data = await saveHelpjuiceAccount(token, value)
    patchConfig({ account: data.account })
  }

  async function saveApiKey(value) {
    const data = await saveHelpjuiceApiKey(token, value)
    patchConfig({ apiKeyConfigured: data.apiKeyConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="Helpjuice" error={error} />

  const configured = config.apiKeyConfigured && Boolean(config.account)

  return (
    <>
      <AdminSection title="Helpjuice integration">
        <p className="admin__muted">
          Lets the assistant search and read articles from the Helpjuice help center. Both values are stored in the
          database; the API key is never shown again after saving.
        </p>

        <StatusRow configured={configured} />
        <p className="admin__muted">The integration is enabled once both the account and the API key are set.</p>
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            Your <strong>account</strong> is the subdomain of your help center: the <code>example</code> in{' '}
            <code>example.helpjuice.com</code>.
          </li>
          <li>
            In Helpjuice, open <strong>Settings → Integrations → API</strong> and copy your <strong>API key</strong>.
          </li>
          <li>Save both values below. The API key is stored write-only and never shown again.</li>
        </ol>
      </AdminSection>

      <AdminSection title="Account">
        <p className="admin__muted">
          The subdomain of your help center (<code>&lt;account&gt;.helpjuice.com</code>).
        </p>

        <ValueField savedValue={config.account} onSave={saveAccount} onLogout={onLogout} placeholder="example" />
      </AdminSection>

      <AdminSection title="API key">
        <p className="admin__muted">Used to call the Helpjuice API. Stored write-only and never shown again.</p>

        <StatusRow configured={config.apiKeyConfigured} />

        <SecretField
          placeholder="API key"
          configuredPlaceholder="Paste a new key to replace it"
          configured={config.apiKeyConfigured}
          onSave={saveApiKey}
          onLogout={onLogout}
        />
      </AdminSection>
    </>
  )
}
