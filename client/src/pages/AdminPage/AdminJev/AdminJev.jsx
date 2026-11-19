import { useState } from 'react'
import { JEV_SETTINGS_DOCUMENT } from '../../../constants.js'
import { getJevConfig, saveJevApiKey, scanJevModels, testJevConnection } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import { useJevDocument } from '../hooks/useJevDocument/useJevDocument.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import DocBar from '../DocBar/DocBar.jsx'
import JevHistory from '../JevHistory/JevHistory.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import { formatDateTime } from '../dates.js'

function countLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function describeNewModels(newModels) {
  if (newModels === null) return ''
  if (newModels === 0) return 'No new models. '

  return `${countLabel(newModels, 'new model')}. `
}

function describeCatalog({ models, scannedAt }, newModels) {
  if (!scannedAt) return 'No models saved yet.'

  return `${describeNewModels(newModels)}${countLabel(models.length, 'model')} saved · last scan ${formatDateTime(scannedAt)}`
}

export default function AdminJev({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getJevConfig, token, onLogout)
  const settings = useJevDocument(token, JEV_SETTINGS_DOCUMENT, onLogout)
  const [keyRevision, setKeyRevision] = useState(0)

  async function saveApiKey(value) {
    const data = await saveJevApiKey(token, value)
    patchConfig({ keyConfigured: data.keyConfigured })
    setKeyRevision(revision => revision + 1)
  }

  function handleCallsChange(event) {
    const enabled = event.target.checked
    settings.updateDraft(draft => ({ ...draft, enabled }))
  }

  const loadError = error ?? settings.loadError
  if (loadError || !config || !settings.document) return <AdminSectionStatus title="Jev" error={loadError} />

  return (
    <>
      <AdminSection title="Jev connection">
        <p className="admin__muted">
          Jev answers a set of questions about a document and returns each answer with a confidence. Soporti calls it
          from two projects: GitHub PR reviews and Legal. This section holds only what both share: the API key and the
          switch for all calls. Each project configures its own model, timeout and min confidence.
        </p>

        <StatusRow configured={config.keyConfigured} />

        <SecretField
          placeholder="Jev API key"
          configuredPlaceholder="Paste a new key to replace it"
          configured={config.keyConfigured}
          onSave={saveApiKey}
          onLogout={onLogout}
          saveLabel="Save key"
        />

        <p className="note">One key for the PR review and Legal projects. Rotating or removing it affects both.</p>
        <p className="admin__muted">The key is stored in the database and never shown again after saving.</p>

        <ConnectionTest key={`test-${keyRevision}`} token={token} onLogout={onLogout} />
        <ModelScan
          key={`scan-${keyRevision}`}
          token={token}
          onLogout={onLogout}
          config={config}
          onScanned={patchConfig}
        />

        <p className="admin__muted">Each project picks its model from this saved list.</p>
      </AdminSection>

      <AdminSection title="Jev calls">
        <label className="admin__switch">
          <input type="checkbox" checked={settings.draft.enabled} onChange={handleCallsChange} />
          <span className="admin__switch-slider" aria-hidden="true" />
          <span className="admin__switch-label">
            Allow Jev calls
            <span className="admin__muted">When off, Soporti does not call Jev from any project.</span>
          </span>
        </label>
        <p className="note">
          Turning it off stops the calls of ALL projects, Legal included. It does not change the auto-approve mode of
          the GitHub repos.
        </p>
      </AdminSection>

      <AdminSection title="Change history">
        <JevHistory
          key={`${settings.document.rev}-${keyRevision}`}
          token={token}
          documentId={JEV_SETTINGS_DOCUMENT}
          onLogout={onLogout}
        />
      </AdminSection>

      <DocBar label="Jev settings" state={settings} />
    </>
  )
}

function ConnectionTest({ token, onLogout }) {
  const [latencyMs, setLatencyMs] = useState(null)
  const { saving, error, save } = useSaveField(onLogout)

  function handleTest() {
    setLatencyMs(null)
    save(async () => {
      const data = await testJevConnection(token)
      setLatencyMs(data.latencyMs)
    })
  }

  return (
    <>
      <div className="admin__form admin__form--row">
        <button className="btn btn--secondary" type="button" onClick={handleTest} disabled={saving}>
          {saving ? 'Testing...' : 'Test connection'}
        </button>
        {latencyMs !== null && <span className="admin__saved">Connected · {latencyMs} ms</span>}
      </div>
      {error && <p className="alert alert--error">{error}</p>}
    </>
  )
}

function ModelScan({ token, onLogout, config, onScanned }) {
  const [newModels, setNewModels] = useState(null)
  const { saving, error, save } = useSaveField(onLogout)

  function handleScan() {
    save(async () => {
      const data = await scanJevModels(token)
      onScanned({ models: data.models, scannedAt: data.scannedAt })
      setNewModels(data.newModels)
    })
  }

  return (
    <>
      <div className="admin__form admin__form--row">
        <button
          className="btn btn--secondary"
          type="button"
          onClick={handleScan}
          disabled={saving || !config.keyConfigured}
        >
          {saving ? 'Scanning...' : 'Scan for new models'}
        </button>
        <span className="admin__muted">{describeCatalog(config, newModels)}</span>
      </div>
      {error && <p className="alert alert--error">{error}</p>}
    </>
  )
}
