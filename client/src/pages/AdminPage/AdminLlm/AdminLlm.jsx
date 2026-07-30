import { useState } from 'react'
import {
  getLlmConfig,
  saveAnthropicApiKey,
  saveAnthropicModel,
  saveLlmProvider,
  saveOpenAIApiKey,
  saveOpenAIModel,
  saveReasoningEffort,
} from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

export default function AdminLlm({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getLlmConfig, token, onLogout)

  function saveField(saveValue, { configKey, responseKey }) {
    return async function save(value) {
      const data = await saveValue(token, value)
      patchConfig({ [configKey]: data[responseKey] })
    }
  }

  if (error || !config) return <AdminSectionStatus title="LLM" error={error} />

  return (
    <>
      <AdminSection title="Active provider">
        <p className="admin__muted">
          The provider the assistant and the PR-review agents run on. Only the selected provider needs credentials — the
          other one keeps whatever you saved for it.
        </p>

        <SelectField
          savedValue={config.provider}
          options={config.providers.map(provider => ({ value: provider.id, label: provider.label }))}
          ariaLabel="Active provider"
          saveLabel="Save provider"
          onSave={saveField(saveLlmProvider, { configKey: 'provider', responseKey: 'provider' })}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="Reasoning effort">
        <p className="admin__muted">
          How much the model thinks before answering. It applies to every agent run — chat, PR reviews, scheduled
          questions and auto-diagnosis alike. Lower effort means fewer tokens, faster replies and fewer tool calls;
          higher effort means deeper reasoning at a higher cost.
        </p>

        <SelectField
          savedValue={config.reasoningEffort}
          options={config.reasoningEffortLevels.map(level => ({ value: level, label: level }))}
          ariaLabel="Reasoning effort"
          saveLabel="Save effort"
          onSave={saveField(saveReasoningEffort, { configKey: 'reasoningEffort', responseKey: 'effort' })}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="OpenAI API key">
        <p className="admin__muted">
          Stored in the database and never shown again after saving. Also used by the knowledge base when it has no key
          of its own.
        </p>

        <StatusRow configured={config.openaiApiKeyConfigured} />

        <SecretField
          placeholder="sk-..."
          configuredPlaceholder="Paste a new key to replace it"
          configured={config.openaiApiKeyConfigured}
          onSave={saveField(saveOpenAIApiKey, { configKey: 'openaiApiKeyConfigured', responseKey: 'apiKeyConfigured' })}
          onLogout={onLogout}
          saveLabel="Save key"
        />
      </AdminSection>

      <AdminSection title="OpenAI model">
        <p className="admin__muted">
          Required while OpenAI is the active provider — there is no default, so the assistant stays disabled until you
          set one. Any model available to your API key works (e.g. <code>gpt-4o</code>, <code>gpt-5.2-codex</code>).
        </p>

        <ValueField
          savedValue={config.openaiModel}
          onSave={saveField(saveOpenAIModel, { configKey: 'openaiModel', responseKey: 'model' })}
          onLogout={onLogout}
          placeholder="gpt-4o"
          saveLabel="Save model"
        />
      </AdminSection>

      <AdminSection title="Anthropic API key">
        <p className="admin__muted">
          Stored in the database and never shown again after saving. Create one at{' '}
          <a className="admin__link" href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
            platform.claude.com
          </a>
          .
        </p>

        <StatusRow configured={config.anthropicApiKeyConfigured} />

        <SecretField
          placeholder="sk-ant-..."
          configuredPlaceholder="Paste a new key to replace it"
          configured={config.anthropicApiKeyConfigured}
          onSave={saveField(saveAnthropicApiKey, {
            configKey: 'anthropicApiKeyConfigured',
            responseKey: 'apiKeyConfigured',
          })}
          onLogout={onLogout}
          saveLabel="Save Anthropic key"
        />
      </AdminSection>

      <AdminSection title="Anthropic model">
        <p className="admin__muted">
          Required while Anthropic is the active provider (e.g. <code>claude-opus-5</code>, <code>claude-sonnet-5</code>
          ). Anthropic keeps no conversation state, so history is replayed from this app on every turn and the knowledge
          base keeps using OpenAI.
        </p>

        <ValueField
          savedValue={config.anthropicModel}
          onSave={saveField(saveAnthropicModel, { configKey: 'anthropicModel', responseKey: 'model' })}
          onLogout={onLogout}
          placeholder="claude-opus-5"
          saveLabel="Save Anthropic model"
        />
      </AdminSection>
    </>
  )
}

function SelectField({ savedValue, options, ariaLabel, saveLabel, onSave, onLogout }) {
  const [edited, setEdited] = useState(null)
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const value = edited ?? savedValue
  const dirty = value !== savedValue

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

      <form className="admin__form admin__form--row" onSubmit={handleSubmit}>
        <select
          className="input admin__input--select"
          aria-label={ariaLabel}
          value={value}
          onChange={event => setEdited(event.target.value)}
          disabled={saving}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="btn btn--primary" type="submit" disabled={saving || !dirty}>
          {saving ? 'Saving...' : saveLabel}
        </button>
        {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
      </form>
    </>
  )
}
