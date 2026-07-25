import { getNotionConfig, saveNotionToken } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'

export default function AdminNotion({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getNotionConfig, token, onLogout)

  async function saveToken(value) {
    const data = await saveNotionToken(token, value)
    patchConfig({ tokenConfigured: data.tokenConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="Notion" error={error} />

  return (
    <>
      <AdminSection title="Notion integration">
        <p className="admin__muted">
          Lets the assistant search and read pages and databases from Notion. It only sees what is shared with the
          integration. The token is stored in the database and never shown again after saving.
        </p>

        <StatusRow configured={config.tokenConfigured} />
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            In Notion, open <strong>Settings → Connections → Develop or manage integrations</strong> and create a{' '}
            <strong>new internal integration</strong>.
          </li>
          <li>
            Copy its <strong>Internal Integration Secret</strong> (it starts with <code>ntn_</code>).
          </li>
          <li>
            <strong>Share</strong> the pages/databases you want the assistant to read with the integration (open a page
            → <strong>•••</strong> → <strong>Connections</strong> → add it). This sharing is the entire access boundary.
          </li>
          <li>Paste the secret below. It is stored write-only and never shown again.</li>
        </ol>

        <SecretField
          placeholder="ntn_..."
          configuredPlaceholder="Paste a new token to replace it"
          configured={config.tokenConfigured}
          onSave={saveToken}
          onLogout={onLogout}
          saveLabel="Save token"
        />
      </AdminSection>
    </>
  )
}
