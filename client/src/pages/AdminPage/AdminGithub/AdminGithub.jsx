import { useState } from 'react'
import {
  absoluteApiUrl,
  getGithubConfig,
  saveGithubCatalog,
  saveGithubToken,
  saveGithubWebhookSecret,
} from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'

const MAX_CATALOG_LENGTH = 100_000
const SECRET_BYTES = 24

function generateSecret() {
  const bytes = new Uint8Array(SECRET_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export default function AdminGithub({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getGithubConfig, token, onLogout)
  const [editedCatalog, setEditedCatalog] = useState(null)
  const { saving: savingCatalog, error: catalogError, savedAt: catalogSavedAt, save } = useSaveField(onLogout)

  const savedCatalog = config?.repoCatalog ?? ''
  const catalog = editedCatalog ?? savedCatalog

  async function saveToken(value) {
    const data = await saveGithubToken(token, value)
    patchConfig({ tokenConfigured: data.tokenConfigured })
  }

  async function saveWebhookSecret(value) {
    const data = await saveGithubWebhookSecret(token, value)
    patchConfig({ webhookSecretConfigured: data.webhookSecretConfigured })
  }

  function handleCatalogSave() {
    save(async () => {
      const data = await saveGithubCatalog(token, catalog)
      patchConfig({ repoCatalog: data.repoCatalog })
      setEditedCatalog(null)
    })
  }

  if (error || !config) return <AdminSectionStatus title="GitHub" error={error} />

  const catalogDirty = catalog !== savedCatalog

  return (
    <>
      <AdminSection title="GitHub token">
        <p className="admin__muted">
          Personal access token used by every GitHub feature: repository tools, clones and PR reviews. It is stored in
          the database and never shown again after saving.
        </p>

        <StatusRow configured={config.tokenConfigured} />

        <SecretField
          placeholder="ghp_..."
          configuredPlaceholder="Paste a new token to replace it"
          configured={config.tokenConfigured}
          onSave={saveToken}
          onLogout={onLogout}
          saveLabel="Save token"
        />
      </AdminSection>

      <AdminSection title="Pull request reviews">
        <p className="admin__muted">
          Soporti reviews PRs when someone requests its review or adds the review label. Deliveries are authenticated
          with a shared webhook secret: generate one below and use the same value when creating the webhook in GitHub
          (Org Settings → Webhooks) with this configuration:
        </p>

        <dl className="admin__kv">
          <div className="admin__kv-row">
            <dt>Payload URL</dt>
            <dd>
              <code>{absoluteApiUrl('/api/webhooks/github')}</code>
            </dd>
          </div>
          <div className="admin__kv-row">
            <dt>Content type</dt>
            <dd>
              <code>application/json</code>
            </dd>
          </div>
          <div className="admin__kv-row">
            <dt>Secret</dt>
            <dd>the value you save below</dd>
          </div>
          <div className="admin__kv-row">
            <dt>Events</dt>
            <dd>Pull requests · Issue comments · Pull request review comments</dd>
          </div>
        </dl>

        <StatusRow configured={config.webhookSecretConfigured} configuredLabel="enabled" unconfiguredLabel="disabled" />

        <SecretField
          placeholder="Webhook secret"
          configuredPlaceholder="Paste a new secret to rotate it"
          configured={config.webhookSecretConfigured}
          onSave={saveWebhookSecret}
          onLogout={onLogout}
          saveLabel="Save secret"
          removeLabel="Disable"
          masked={false}
          onGenerate={generateSecret}
        />

        <p className="admin__muted">
          Copy the secret into GitHub before saving — it is stored write-only and cannot be shown again.
        </p>
      </AdminSection>

      <AdminSection title="Repository catalog">
        <p className="admin__muted">
          Free text describing what each repository covers. It is injected into the agent prompt so it can pick the most
          relevant repo(s) for a question before calling tools. Markdown works well (e.g. one <code>### org/repo</code>{' '}
          heading per repo followed by a short summary).
        </p>

        {catalogError && <p className="alert alert--error">{catalogError}</p>}

        <textarea
          className="textarea textarea--code"
          placeholder={'### org/backend (Python)\nThe backend: payments, auth, webhooks...'}
          value={catalog}
          onChange={event => setEditedCatalog(event.target.value)}
          disabled={savingCatalog}
          rows={16}
        />

        <div className="admin__form admin__form--row">
          <span className="admin__muted">
            {catalog.length.toLocaleString()} / {MAX_CATALOG_LENGTH.toLocaleString()} characters
          </span>
          <button
            className="btn btn--primary"
            type="button"
            onClick={handleCatalogSave}
            disabled={!catalogDirty || savingCatalog}
          >
            {savingCatalog ? 'Saving...' : 'Save catalog'}
          </button>
          {!catalogError && catalogSavedAt && !catalogDirty && <span className="admin__saved">Saved</span>}
        </div>
      </AdminSection>
    </>
  )
}
