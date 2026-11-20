import { useState } from 'react'
import { saveJevApiKey, saveJevCalls, scanJevModels, testJevConnection } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import SecretField from '../../SecretField/SecretField.jsx'
import StatusRow from '../../StatusRow/StatusRow.jsx'
import ToggleField from '../../ToggleField/ToggleField.jsx'
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
  const [keyRevision, setKeyRevision] = useState(0)

  async function saveApiKey(value) {
    const data = await saveJevApiKey(token, value)
    onConfigChange({ keyConfigured: data.keyConfigured })
    setKeyRevision(revision => revision + 1)
    onChanged()
  }

  async function saveCalls(enabled) {
    const data = await saveJevCalls(token, enabled)
    onConfigChange({ callsEnabled: data.enabled })
    onChanged()
  }

  return (
    <AdminSection title="Jev">
      <p className="admin__muted">
        Every guard asks Jev, TypeSafe’s question-answering model, its questions and gets each answer with a confidence.
        The API key and the calls switch are shared by all the guards.
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

      <ToggleField
        enabled={config.callsEnabled}
        label="Allow Jev calls"
        hint={
          config.keyConfigured || config.callsEnabled
            ? 'When off, no guard calls Jev: the chat does not offer them and PR reviews decide without them.'
            : 'Save the API key before turning the calls on.'
        }
        disabled={!config.keyConfigured && !config.callsEnabled}
        onSave={saveCalls}
        onLogout={onLogout}
      />
      <p className="alert alert--warning">
        A guard sends what it checks to a third party. Review TypeSafe’s data retention before using it.
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
