import Icon from '../Icon/Icon.jsx'
import './ArtifactCard.css'

const ICON_SIZE = 16

export default function ArtifactCard({ artifactId, title, version, onOpen }) {
  const versionLabel = version > 1 ? `Version ${version}` : 'Interactive artifact'

  if (!onOpen) {
    return (
      <div className="card artifact-card artifact-card--static">
        <Icon name="artifact" size={ICON_SIZE} />
        <span className="artifact-card__title">{title}</span>
        <span className="artifact-card__meta">{versionLabel}</span>
      </div>
    )
  }

  return (
    <button type="button" className="card artifact-card" onClick={() => onOpen(artifactId)}>
      <Icon name="artifact" size={ICON_SIZE} />
      <span className="artifact-card__title">{title}</span>
      <span className="artifact-card__meta">{versionLabel}</span>
      <span className="artifact-card__action">Open</span>
    </button>
  )
}
