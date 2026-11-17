import { PROFILE_OPTIONS } from '../../../../constants.js'
import './ProfileToggle.css'

export default function ProfileToggle({ selectedProfile, onSelectProfile }) {
  const selectedIndex = Math.max(
    PROFILE_OPTIONS.findIndex(profile => profile.id === selectedProfile),
    0
  )
  const selected = PROFILE_OPTIONS[selectedIndex]

  return (
    <div className="sidebar__section profile-toggle">
      <div className="profile-toggle__row">
        <h2 className="sidebar__section-title profile-toggle__title">Profile</h2>
        <div
          className="profile-toggle__track"
          style={{ '--profile-index': selectedIndex, '--profile-count': PROFILE_OPTIONS.length }}
        >
          <span className="profile-toggle__thumb" aria-hidden="true" />
          {PROFILE_OPTIONS.map(profile => (
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
