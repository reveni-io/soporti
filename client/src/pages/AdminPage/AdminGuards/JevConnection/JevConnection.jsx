import { useState } from 'react'
import { JEV_SETTINGS_DOCUMENT } from '../../../../constants.js'
import { saveJevApiKey, scanJevModels, testJevConnection } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import SecretField from '../../SecretField/SecretField.jsx'
import StatusRow from '../../StatusRow/StatusRow.jsx'
import { formatDateTime } from '../../dates.js'

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

export default function JevConnection({ token, onLogout, config, onConfigChange, onChanged }) {
  const settings = useJevDocument(token, JEV_SETTINGS_DOCUMENT, onLogout)
  const [keyRevision, setKeyRevision] = useState(0)

  async function saveApiKey(value) {
    const data = await saveJevApiKey(token, value)
    onConfigChange({ keyConfigured: data.keyConfigured })
    setKeyRevision(revision => revision + 1)
    onChanged()
  }

  async function saveSettings() {
    await settings.save()
    onChanged()
  }

  function handleCallsChange(event) {
    const enabled = event.target.checked
    settings.updateDraft(draft => ({ ...draft, enabled }))
  }

  if (settings.loadError) {
    return (
      <AdminSection title="Jev">
        <p className="alert alert--error">{settings.loadError}</p>
      </AdminSection>
    )
  }
  if (!settings.document) {
    return (
      <AdminSection title="Jev">
        <p className="admin__muted">Loading...</p>
      </AdminSection>
    )
  }

  return (
    <AdminSection title="Jev">
      <p className="admin__muted">
        Every guard asks Jev, TypeSafe’s question-answering model, its questions and gets each answer with a confidence.
        The API key and the switch for every call are shared by all the guards.
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
      <p className="admin__muted">The key is stored in the database and never shown again after saving.</p>

      <label className="admin__switch">
        <input
          type="checkbox"
          checked={settings.draft.enabled}
          onChange={handleCallsChange}
          disabled={!config.keyConfigured && !settings.draft.enabled}
        />
        <span className="admin__switch-slider" aria-hidden="true" />
        <span className="admin__switch-label">
          Allow Jev calls
          <span className="admin__muted">When off, no guard calls Jev.</span>
        </span>
      </label>
      {!config.keyConfigured && <p className="admin__muted">Save the API key above before turning Jev calls on.</p>}
      <SettingsSave state={{ ...settings, save: saveSettings }} />

      <p className="note">
        Turning it off stops the calls of every guard. It does not change the auto-approve mode of the GitHub repos.
      </p>

      <ConnectionTest key={`test-${keyRevision}`} token={token} onLogout={onLogout} />
      <ModelScan
        key={`scan-${keyRevision}`}
        token={token}
        onLogout={onLogout}
        config={config}
        onScanned={onConfigChange}
      />
    </AdminSection>
  )
}

function SettingsSave({ state }) {
  const { dirty, saving, saveError, conflict, savedAt, save, reload } = state

  return (
    <>
      {saveError && <p className="alert alert--error">{saveError}</p>}
      <div className="admin__form admin__form--row">
        <button className="btn btn--primary" type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {conflict && (
          <button className="btn btn--secondary" type="button" onClick={reload}>
            Reload latest
          </button>
        )}
        {!saveError && savedAt && !dirty && <span className="admin__saved">Saved</span>}
      </div>
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
