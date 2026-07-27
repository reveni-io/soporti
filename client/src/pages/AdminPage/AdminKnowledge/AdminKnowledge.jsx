import { getKnowledgeConfig, saveKnowledgeApiKey, saveKnowledgeVectorStore } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

export default function AdminKnowledge({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getKnowledgeConfig, token, onLogout)

  async function saveApiKey(value) {
    const data = await saveKnowledgeApiKey(token, value)
    patchConfig({ apiKeyConfigured: data.apiKeyConfigured, keyAvailable: data.keyAvailable })
  }

  async function saveVectorStore(value) {
    const data = await saveKnowledgeVectorStore(token, value)
    patchConfig({ vectorStoreId: data.vectorStoreId })
  }

  if (error || !config) return <AdminSectionStatus title="Knowledge base" error={error} />

  const configured = config.keyAvailable && Boolean(config.vectorStoreId)

  return (
    <>
      <AdminSection title="Vector store">
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

        <StatusRow configured={configured} />

        <ValueField
          savedValue={config.vectorStoreId}
          onSave={saveVectorStore}
          onLogout={onLogout}
          placeholder="vs_..."
        />
      </AdminSection>

      <AdminSection title="OpenAI API key">
        <p className="admin__muted">
          The knowledge base runs on OpenAI Vector Stores whichever provider the assistant uses. Leave this empty to
          reuse the OpenAI key from the LLM section, or set a dedicated key here.
        </p>

        <StatusRow
          configured={config.apiKeyConfigured}
          configuredLabel="dedicated key"
          unconfiguredLabel="using the LLM section key"
        />

        <SecretField
          placeholder="sk-..."
          configuredPlaceholder="Paste a new key to replace it"
          configured={config.apiKeyConfigured}
          onSave={saveApiKey}
          onLogout={onLogout}
          saveLabel="Save key"
        />
      </AdminSection>
    </>
  )
}
