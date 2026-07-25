import { getShortcutConfig, saveShortcutToken } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'

export default function AdminShortcut({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getShortcutConfig, token, onLogout)

  async function saveToken(value) {
    const data = await saveShortcutToken(token, value)
    patchConfig({ tokenConfigured: data.tokenConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="Shortcut" error={error} />

  return (
    <>
      <AdminSection title="Shortcut integration">
        <p className="admin__muted">
          Lets the assistant look up Shortcut stories (user stories, bugs, chores) by ID or search, and lets PR reviews
          fetch the story a pull request references as its spec. The token is stored in the database and never shown
          again after saving.
        </p>

        <StatusRow configured={config.tokenConfigured} />
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            In Shortcut, open <strong>Settings → Your Account → API Tokens</strong>.
          </li>
          <li>
            Give the token a name (e.g. <code>soporti</code>) and click <strong>Generate Token</strong>.
          </li>
          <li>
            The token inherits the permissions of the account that creates it — consider a dedicated read-only member
            account if you want to limit access.
          </li>
          <li>Paste the token below. It is stored write-only and never shown again.</li>
        </ol>

        <SecretField
          placeholder="Shortcut API token"
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
