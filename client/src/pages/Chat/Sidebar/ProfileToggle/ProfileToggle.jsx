const PROFILES = [
  { id: 'support', label: 'Support', hint: 'Simplified explanations focused on behavior' },
  { id: 'tech', label: 'Tech', hint: 'Detailed code, architecture, and file paths' },
]

export default function ProfileToggle({ selectedProfile, onSelectProfile }) {
  const selected = PROFILES.find(profile => profile.id === selectedProfile) ?? PROFILES[0]

  return (
    <div className="sidebar__profile">
      <h2 className="sidebar__section-title">Profile</h2>
      <div className="sidebar__profile-toggle">
        {PROFILES.map(profile => (
          <button
            key={profile.id}
            className={`sidebar__profile-btn ${profile.id === selected.id ? 'sidebar__profile-btn--active' : ''}`}
            onClick={() => onSelectProfile(profile.id)}
          >
            {profile.label}
          </button>
        ))}
      </div>
      <p className="sidebar__profile-hint">{selected.hint}</p>
    </div>
  )
}
