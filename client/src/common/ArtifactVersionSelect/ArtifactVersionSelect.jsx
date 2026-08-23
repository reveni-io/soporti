import './ArtifactVersionSelect.css'

export default function ArtifactVersionSelect({ versions, value, onChange, className = '' }) {
  if (versions.length < 2) return null

  return (
    <select
      className={`input artifact-version-select ${className}`.trim()}
      value={value ?? ''}
      onChange={event => onChange(Number(event.target.value))}
      aria-label="Artifact version"
    >
      {versions.map(version => (
        <option key={version} value={version}>
          Version {version}
        </option>
      ))}
    </select>
  )
}
