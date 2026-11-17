import {
  getAuthConfig,
  saveAllowedDomains,
  saveAuthMethods,
  saveGoogleClientId,
  saveGoogleClientSecret,
} from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import SecretField from '../SecretField/SecretField.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ValueField from '../ValueField/ValueField.jsx'
import GoogleDomains from './GoogleDomains/GoogleDomains.jsx'
import SignInMethods from './SignInMethods/SignInMethods.jsx'

export default function AdminAuthentication({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getAuthConfig, token, onLogout)
  const { saving: savingMethods, error: methodsError, save: saveMethods } = useSaveField(onLogout)

  async function toggleMethod(key) {
    const previous = { googleEnabled: config.googleEnabled, passwordEnabled: config.passwordEnabled }
    const next = {
      googleEnabled: key === 'google' ? !config.googleEnabled : config.googleEnabled,
      passwordEnabled: key === 'password' ? !config.passwordEnabled : config.passwordEnabled,
    }

    patchConfig(next)
    const saved = await saveMethods(async () => {
      const data = await saveAuthMethods(token, next)
      patchConfig({ googleEnabled: data.googleEnabled, passwordEnabled: data.passwordEnabled })
    })

    if (!saved) patchConfig(previous)
  }

  async function saveClientId(value) {
    const data = await saveGoogleClientId(token, value)
    patchConfig({ googleClientId: data.googleClientId })
  }

  async function saveClientSecret(value) {
    const data = await saveGoogleClientSecret(token, value)
    patchConfig({ googleClientSecretConfigured: data.googleClientSecretConfigured })
  }

  async function saveDomains(domains) {
    const data = await saveAllowedDomains(token, domains)
    patchConfig({ domains: data.domains })
  }

  if (error || !config) return <AdminSectionStatus title="Sign-in methods" error={error} />

  return (
    <>
      <SignInMethods
        googleEnabled={config.googleEnabled}
        passwordEnabled={config.passwordEnabled}
        saving={savingMethods}
        error={methodsError}
        onToggle={toggleMethod}
      />

      <AdminSection title="Google Client ID">
        <p className="admin__muted">
          OAuth client id used to verify Google sign-ins. Create one in the Google Cloud Console (APIs &amp; Services →
          Credentials → OAuth client ID, type <em>Web application</em>). The frontend build also needs{' '}
          <code>VITE_GOOGLE_CLIENT_ID</code> set to this same value.
        </p>

        {config.googleEnabled && !config.googleClientId && (
          <p className="alert alert--warning">
            Google sign-in is enabled but no client id is set — the Google button stays hidden until you save one.
          </p>
        )}

        <ValueField
          savedValue={config.googleClientId ?? ''}
          onSave={saveClientId}
          onLogout={onLogout}
          placeholder="xxxxx.apps.googleusercontent.com"
          removable
        />
      </AdminSection>

      <AdminSection title="Google client secret">
        <p className="admin__muted">
          With a client secret, Google sign-in also asks for read-only access to each user&apos;s Gmail and Calendar.
          Use the secret of the same OAuth client. Enable the <strong>Gmail API</strong> and the{' '}
          <strong>Google Calendar API</strong> in that Google Cloud project, and keep the consent screen{' '}
          <em>Internal</em> so the Gmail scope needs no Google verification. Users who already signed in connect from
          Settings → Connections. The secret is stored encrypted, write-only and never shown again; remove it to go back
          to plain sign-in.
        </p>

        <StatusRow configured={Boolean(config.googleClientSecretConfigured)} />

        <SecretField
          placeholder="GOCSPX-..."
          configuredPlaceholder="Paste a new secret to replace it"
          configured={Boolean(config.googleClientSecretConfigured)}
          onSave={saveClientSecret}
          onLogout={onLogout}
          saveLabel="Save secret"
        />
      </AdminSection>

      {config.googleEnabled && <GoogleDomains savedDomains={config.domains} onSave={saveDomains} onLogout={onLogout} />}
    </>
  )
}
