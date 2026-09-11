import { getFigmaConfig, saveFigmaToken, saveFigmaComments } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ToggleField from '../ToggleField/ToggleField.jsx'

export default function AdminFigma({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getFigmaConfig, token, onLogout)

  async function saveToken(value) {
    const data = await saveFigmaToken(token, value)
    patchConfig({ tokenConfigured: data.tokenConfigured })
  }

  async function saveComments(enabled) {
    const data = await saveFigmaComments(token, enabled)
    patchConfig({ commentsEnabled: data.commentsEnabled })
  }

  if (error || !config) return <AdminSectionStatus title="Figma" error={error} />

  return (
    <>
      <AdminSection title="Figma integration">
        <p className="admin__muted">
          Lets the assistant look at designs: paste a figma.com link in the chat and it lists the pages and frames,
          reads the layers of a screen — texts, fonts, colors, components — and renders a screenshot it can see and show
          in the conversation. It only reaches the files the token&apos;s account can open. The token is stored in the
          database and never shown again after saving.
        </p>

        <StatusRow configured={config.tokenConfigured} />
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            In Figma, open your <strong>account menu → Settings → Security</strong> and, under{' '}
            <strong>Personal access tokens</strong>, click <strong>Generate new token</strong>.
          </li>
          <li>
            Give it a name (e.g. <code>soporti</code>) and grant the <strong>File content</strong> and{' '}
            <strong>Comments</strong> scopes with read access. Add write access to Comments only if you plan to turn on
            commenting below.
          </li>
          <li>
            The token reaches every file that account can open — use a dedicated account if you want to limit what the
            assistant sees.
          </li>
          <li>Paste the token below. It is stored write-only and never shown again.</li>
        </ol>

        <SecretField
          placeholder="figd_..."
          configuredPlaceholder="Paste a new token to replace it"
          configured={config.tokenConfigured}
          onSave={saveToken}
          onLogout={onLogout}
          saveLabel="Save token"
        />
      </AdminSection>

      <AdminSection title="Comments">
        <p className="admin__muted">
          With this on, the assistant can post a comment on a design from a conversation — pinned to a frame or as a
          reply to an existing thread. It shows the text first and only posts once you say yes. Figma&apos;s API cannot
          edit layers, so comments are the only thing the assistant can ever write in Figma.
        </p>

        <p className="note">
          Figma signs every comment with the account the token belongs to, so the assistant opens a comment with the
          name of the person it is from when that is somebody else. The token needs the <strong>Comments</strong> scope
          with write access. If you have narrowed the assistant&apos;s tools in <strong>Subagents</strong>, grant it the
          new Figma tool there too.
        </p>

        <ToggleField
          enabled={config.commentsEnabled}
          label="Let the assistant post comments on designs"
          hint="Off by default — looking at designs never needs it."
          onSave={saveComments}
          onLogout={onLogout}
        />
      </AdminSection>
    </>
  )
}
