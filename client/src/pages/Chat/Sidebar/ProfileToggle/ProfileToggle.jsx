import './ProfileToggle.css'

const PROFILES = [
  { id: 'support', label: 'Support', hint: 'Simplified explanations focused on behavior' },
  { id: 'tech', label: 'Tech', hint: 'Detailed code, architecture, and file paths' },
]

export default function ProfileToggle({ selectedProfile, onSelectProfile }) {
  const selectedIndex = Math.max(
    PROFILES.findIndex(profile => profile.id === selectedProfile),
    0
  )
  const selected = PROFILES[selectedIndex]

  return (
    <div className="sidebar__section profile-toggle">
      <div className="profile-toggle__row">
        <h2 className="sidebar__section-title profile-toggle__title">Profile</h2>
        <div
          className="profile-toggle__track"
          style={{ '--profile-index': selectedIndex, '--profile-count': PROFILES.length }}
        >
          <span className="profile-toggle__thumb" aria-hidden="true" />
          {PROFILES.map(profile => (
            <button
              key={profile.id}
              type="button"
              className={`profile-toggle__btn ${profile.id === selected.id ? 'profile-toggle__btn--active' : ''}`}
              aria-pressed={profile.id === selected.id}
              onClick={() => onSelectProfile(profile.id)}
            >
              {profile.label}
            </button>
          ))}
        </div>
      </div>
      <p key={selected.id} className="profile-toggle__hint">
        {selected.hint}
      </p>
    </div>
  )
}
