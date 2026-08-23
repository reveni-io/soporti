import ArtifactFrame from '../ArtifactFrame/ArtifactFrame.jsx'
import './ArtifactBody.css'

const FALLBACK_TITLE = 'Artifact'

export default function ArtifactBody({ html, title, loading, error, frameRef }) {
  if (error) return <p className="alert alert--error">{error}</p>
  if (loading && !html) return <p className="artifact-body__muted">Loading artifact...</p>
  if (!html) return <p className="artifact-body__muted">This artifact is no longer available.</p>

  return (
    <div className="card artifact-body__canvas">
      <ArtifactFrame html={html} title={title ?? FALLBACK_TITLE} ref={frameRef} />
    </div>
  )
}
