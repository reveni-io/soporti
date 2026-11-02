import { useState } from 'react'
import { getHubspotConfig, saveHubspotToken } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import HubspotConnectionTest from './HubspotConnectionTest/HubspotConnectionTest.jsx'
import HubspotPermissionsForm from './HubspotPermissionsForm/HubspotPermissionsForm.jsx'

export default function AdminHubspot({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getHubspotConfig, token, onLogout)
  const [savedKeys, setSavedKeys] = useState(0)

  async function saveToken(value) {
    const data = await saveHubspotToken(token, value)
    patchConfig({ tokenConfigured: data.tokenConfigured })
    setSavedKeys(count => count + 1)
  }

  if (error || !config) return <AdminSectionStatus title="HubSpot" error={error} />

  return (
    <>
      <AdminSection title="HubSpot integration">
        <p className="admin__muted">
          Lets the assistant work with your HubSpot CRM: search and read contacts, companies, deals, tickets, their
          activity timeline, lists, conversations and marketing campaigns and, where you allow it, create and update
          records, log activities and reply to customers. In a chat it shows a change first and only makes it once you
          say yes; scheduled queries, auto-diagnoses and questions over MCP can only create, update and associate
          records. The key is stored in the database and never shown again after saving.
        </p>

        <StatusRow configured={config.tokenConfigured} />
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            Choose what the assistant may do in each area under <strong>Permissions</strong> and save: the list under it
            shows the scopes the key needs.
          </li>
          <li>
            In HubSpot, open <strong>Settings → Service Keys</strong> and create a key. You need to be a{' '}
            <strong>Super Admin</strong> or have <strong>Developer tools</strong> access.
          </li>
          <li>
            Give it a name (e.g. <code>soporti</code>) and grant exactly the scopes listed under{' '}
            <strong>Permissions</strong>. A token from an existing private app works too.
          </li>
          <li>Paste the key below. It is stored write-only and never shown again. Then test the connection.</li>
        </ol>

        <SecretField
          placeholder="HubSpot Service Key"
          configuredPlaceholder="Paste a new key to replace it"
          configured={config.tokenConfigured}
          onSave={saveToken}
          onLogout={onLogout}
          saveLabel="Save key"
        />

        {config.tokenConfigured && <HubspotConnectionTest key={savedKeys} token={token} onLogout={onLogout} />}
      </AdminSection>

      <AdminSection title="Permissions">
        <p className="admin__muted">
          Off hides an area from the assistant. Read lets it search and read. Write adds creating and updating records,
          logging activities, associating records and adding them to lists. Full adds archiving, merging and removing
          associations. In Conversations, Reply lets it answer customers. In a chat, every change is shown first and
          only happens once the person says yes. When you raise a level, add the new scopes to the key in HubSpot too.
        </p>

        <HubspotPermissionsForm token={token} config={config} onLogout={onLogout} onSaved={patchConfig} />

        <p className="note">
          If you have narrowed the assistant&apos;s tools in <strong>Subagents</strong>, grant it the new HubSpot tools
          there too.
        </p>
      </AdminSection>
    </>
  )
}
