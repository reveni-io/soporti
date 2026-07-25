import AdminSection from '../../AdminSection/AdminSection.jsx'

export default function SignInMethods({ googleEnabled, passwordEnabled, saving, error, onToggle }) {
  return (
    <AdminSection title="Sign-in methods">
      <p className="admin__muted">Choose how users can sign in. The login page only shows the enabled methods.</p>

      {error && <p className="alert alert--error">{error}</p>}

      <MethodSwitch
        label="Google sign-in"
        description="One-click sign-in with a Google account."
        checked={googleEnabled}
        disabled={saving}
        onChange={() => onToggle('google')}
      />

      <MethodSwitch
        label="Email & password"
        description="Accounts created by an admin in the Users section."
        checked={passwordEnabled}
        disabled={saving}
        onChange={() => onToggle('password')}
      />

      {!passwordEnabled && (
        <p className="note">
          The email &amp; password form is hidden on the login page. Admins can always sign in with their password at{' '}
          <code>/admin</code> — you cannot lock yourself out.
        </p>
      )}

      {!googleEnabled && !passwordEnabled && (
        <p className="alert alert--warning">
          Both methods are disabled: regular users cannot sign in at all. Only admins keep access (via{' '}
          <code>/admin</code>).
        </p>
      )}
    </AdminSection>
  )
}

function MethodSwitch({ label, description, checked, disabled, onChange }) {
  return (
    <label className="admin__switch">
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="admin__switch-slider" aria-hidden="true" />
      <span className="admin__switch-label">
        {label}
        <span className="admin__muted">{description}</span>
      </span>
    </label>
  )
}
