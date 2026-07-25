import { getSentryConfig, saveSentryAuthToken, saveSentryOrg } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

export default function AdminSentry({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getSentryConfig, token, onLogout)

  async function saveOrg(value) {
    const data = await saveSentryOrg(token, value)
    patchConfig({ org: data.org })
  }

  async function saveAuthToken(value) {
    const data = await saveSentryAuthToken(token, value)
    patchConfig({ tokenConfigured: data.tokenConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="Sentry" error={error} />

  const configured = config.tokenConfigured && Boolean(config.org)

  return (
    <>
      <AdminSection title="Sentry integration">
        <p className="admin__muted">
          Lets the assistant search and inspect production errors and issues in Sentry. Both values are stored in the
          database; the auth token is never shown again after saving.
        </p>

        <StatusRow configured={configured} />
        <p className="admin__muted">
          The integration is enabled once both the organization and the auth token are set.
        </p>
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            Your <strong>organization</strong> is the slug in your Sentry URL: the <code>my-org</code> in{' '}
            <code>sentry.io/organizations/my-org/</code>.
          </li>
          <li>
            In Sentry, open <strong>Settings → Auth Tokens</strong> and create a token with issue read access. Copy the{' '}
            <strong>auth token</strong>.
          </li>
          <li>Save both values below. The auth token is stored write-only and never shown again.</li>
        </ol>
      </AdminSection>

      <AdminSection title="Organization">
        <p className="admin__muted">
          The slug of your Sentry organization (<code>sentry.io/organizations/&lt;org&gt;/</code>).
        </p>

        <ValueField savedValue={config.org} onSave={saveOrg} onLogout={onLogout} placeholder="my-org" />
      </AdminSection>

      <AdminSection title="Auth token">
        <p className="admin__muted">Used to call the Sentry API. Stored write-only and never shown again.</p>

        <StatusRow configured={config.tokenConfigured} />

        <SecretField
          placeholder="Auth token"
          configuredPlaceholder="Paste a new token to replace it"
          configured={config.tokenConfigured}
          onSave={saveAuthToken}
          onLogout={onLogout}
        />
      </AdminSection>
    </>
  )
}
