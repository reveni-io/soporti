import { useState } from 'react'
import { getShortcutConfig, saveShortcutToken, saveShortcutWrites } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
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

  async function saveWrites(enabled) {
    const data = await saveShortcutWrites(token, enabled)
    patchConfig({ writesEnabled: data.writesEnabled })
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

      <AdminSection title="Write access">
        <p className="admin__muted">
          With this on, the assistant can file a story, comment on one and change its fields from a conversation — the
          only write access it has anywhere. It shows the draft first, and always asks whose name the story goes under
          before creating anything.
        </p>

        <p className="note">
          A Shortcut token belongs to one member, so Shortcut records that member as the creator of every story and the
          author of every edit. What the assistant sets is the <strong>Requester</strong> of a story and the author of a
          comment — the fields your team reads as the person behind the work. Automated runs (scheduled queries, the
          Slack ticket poller, the MCP endpoint) stay read-only, since nobody is there to confirm who is asking. If you
          have narrowed the assistant&apos;s tools in <strong>Subagents</strong>, grant it the new Shortcut tools there
          too.
        </p>

        <WriteAccessField enabled={config.writesEnabled} onSave={saveWrites} onLogout={onLogout} />
      </AdminSection>
    </>
  )
}

function WriteAccessField({ enabled, onSave, onLogout }) {
  const [edited, setEdited] = useState(null)
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const value = edited ?? enabled
  const dirty = value !== enabled

  function handleSubmit(event) {
    event.preventDefault()
    save(async () => {
      await onSave(value)
      setEdited(null)
    })
  }

  return (
    <>
      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form" onSubmit={handleSubmit}>
        <label className="admin__switch">
          <input
            type="checkbox"
            checked={value}
            onChange={event => setEdited(event.target.checked)}
            disabled={saving}
          />
          <span className="admin__switch-slider" aria-hidden="true" />
          <span className="admin__switch-label">
            Let the assistant create and update stories
            <span className="admin__muted">Off by default — reading and searching stories never needs it.</span>
          </span>
        </label>

        <div className="admin__form admin__form--row">
          <button className="btn btn--primary" type="submit" disabled={saving || !dirty}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
        </div>
      </form>
    </>
  )
}
