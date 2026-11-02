import { getVideoConfig, saveVideoEffort, saveVideoModel, saveVideoProvider } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SelectField from '../SelectField/SelectField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'

export default function AdminVideo({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getVideoConfig, token, onLogout)

  function saveField(saveValue, field) {
    return async function save(value) {
      const data = await saveValue(token, value)
      patchConfig({ [field]: data[field], configured: data.configured })
    }
  }

  if (error || !config) return <AdminSectionStatus title="Video" error={error} />

  return (
    <>
      <AdminSection title="Video agents">
        <p className="admin__muted">
          The storyboard and video agents run on these settings instead of the chat ones, and reuse the provider&apos;s
          API key from the LLM section. Video work runs long and unattended, so it defaults to the highest effort:
          efforts up to <code>max</code> think longer, so every storyboard and video takes more time and costs more.
        </p>

        <StatusRow configured={config.configured} />
      </AdminSection>

      <AdminSection title="Provider">
        <p className="admin__muted">
          Until you save one, the video agents follow the chat&apos;s active provider. The provider needs its API key in
          the LLM section.
        </p>

        <SelectField
          savedValue={config.provider}
          options={config.providers.map(provider => ({ value: provider.id, label: provider.label }))}
          ariaLabel="Video provider"
          saveLabel="Save provider"
          onSave={saveField(saveVideoProvider, 'provider')}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="Model">
        <p className="admin__muted">
          Any model of the selected provider (e.g. <code>claude-opus-5</code>, <code>gpt-5.2</code>). Leave it empty to
          use the provider&apos;s model from the LLM section.
        </p>

        <ValueField
          savedValue={config.model}
          onSave={saveField(saveVideoModel, 'model')}
          onLogout={onLogout}
          placeholder="Same as the LLM section"
          saveLabel="Save model"
        />
      </AdminSection>

      <AdminSection title="Reasoning effort">
        <SelectField
          savedValue={config.effort}
          options={config.effortLevels.map(level => ({ value: level, label: level }))}
          ariaLabel="Video reasoning effort"
          saveLabel="Save effort"
          onSave={saveField(saveVideoEffort, 'effort')}
          onLogout={onLogout}
        />
      </AdminSection>
    </>
  )
}
