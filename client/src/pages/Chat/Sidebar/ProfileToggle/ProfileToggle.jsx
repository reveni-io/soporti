import Icon from '../../../../common/Icon/Icon.jsx'
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
      <h2 className="sidebar__section-title">Profile</h2>
      <div
        className="profile-toggle__track"
        role="group"
        aria-label="Answer profile"
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
            <Icon name={profile.icon} size={14} strokeWidth={2.2} className="profile-toggle__icon" />
            {profile.label}
          </button>
        ))}
      </div>
      <p key={selected.id} className="profile-toggle__hint">
        {selected.hint}
      </p>
    </div>
  )
}
