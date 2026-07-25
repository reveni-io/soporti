import {
  getOpenAIConfig,
  saveOpenAIApiKey,
  saveOpenAIModel,
  saveOpenAIVectorStore,
} from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

export default function AdminOpenAI({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getOpenAIConfig, token, onLogout)

  async function saveApiKey(value) {
    const data = await saveOpenAIApiKey(token, value)
    patchConfig({ apiKeyConfigured: data.apiKeyConfigured })
  }

  async function saveModel(value) {
    const data = await saveOpenAIModel(token, value)
    patchConfig({ model: data.model })
  }

  async function saveVectorStore(value) {
    const data = await saveOpenAIVectorStore(token, value)
    patchConfig({ vectorStoreId: data.vectorStoreId })
  }

  if (error || !config) return <AdminSectionStatus title="OpenAI" error={error} />

  return (
    <>
      <AdminSection title="OpenAI API key">
        <p className="admin__muted">
          API key used by the assistant, the PR-review agents and the knowledge base. It is stored in the database and
          never shown again after saving.
        </p>

        <StatusRow configured={config.apiKeyConfigured} />

        <SecretField
          placeholder="sk-..."
          configuredPlaceholder="Paste a new key to replace it"
          configured={config.apiKeyConfigured}
          onSave={saveApiKey}
          onLogout={onLogout}
          saveLabel="Save key"
        />
      </AdminSection>

      <AdminSection title="Model">
        <p className="admin__muted">
          The chat and review model. Required — there is no default, so the assistant stays disabled until you set one.
          Any model available to your API key works (e.g. <code>gpt-4o</code>, <code>gpt-5.2-codex</code>).
        </p>

        <ValueField
          savedValue={config.model}
          onSave={saveModel}
          onLogout={onLogout}
          placeholder="gpt-4o"
          saveLabel="Save model"
        />
      </AdminSection>

      <AdminSection title="Knowledge base vector store">
        <p className="admin__muted">
          OpenAI vector store id used to surface similar solved cases. Optional — leave empty to disable the knowledge
          base. Create one at{' '}
          <a
            className="admin__link"
            href="https://platform.openai.com/storage/vector-stores"
            target="_blank"
            rel="noreferrer"
          >
            platform.openai.com
          </a>
          .
        </p>

        <ValueField
          savedValue={config.vectorStoreId}
          onSave={saveVectorStore}
          onLogout={onLogout}
          placeholder="vs_..."
        />
      </AdminSection>
    </>
  )
}
