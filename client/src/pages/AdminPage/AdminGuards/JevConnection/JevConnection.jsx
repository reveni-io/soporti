import { useState } from 'react'
import { saveJevApiKey, testJevConnection } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import SecretField from '../../SecretField/SecretField.jsx'
import StatusRow from '../../StatusRow/StatusRow.jsx'

export default function JevConnection({ token, onLogout, config, onConfigChange }) {
  const [keyRevision, setKeyRevision] = useState(0)

  async function saveApiKey(value) {
    const data = await saveJevApiKey(token, value)
    onConfigChange({ keyConfigured: data.keyConfigured })
    setKeyRevision(revision => revision + 1)
  }

  return (
    <AdminSection title="Jev">
      <p className="admin__muted">
        Every guard asks Jev, TypeSafe’s question-answering model, always in its latest release, and gets each answer
        with a confidence. The API key is shared by all the guards: with it saved, anyone who asks for a guard can use
        it.
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

      <p className="alert alert--warning">
        A guard sends what it checks to a third party. Review TypeSafe’s data retention before using it.
      </p>

      <ConnectionTest key={`test-${keyRevision}`} token={token} onLogout={onLogout} />
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
