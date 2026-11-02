import VideoStatusBadge from '../../../common/VideoStatusBadge/VideoStatusBadge.jsx'
import './ProductionStatus.css'

export default function ProductionStatus({ version, queuePosition }) {
  if (!version) return <p className="production-status__note">Preparing the first version…</p>

  return (
    <div className="card production-status">
      <h2 className="production-status__title">Version {version.version}</h2>
      <VideoStatusBadge status={version.status} phase={version.phase} progress={version.progress} />
      {queuePosition && <p className="production-status__note">Position {queuePosition} in the queue.</p>}
      {version.step && <p className="production-status__note">{version.step}</p>}
      {version.error && <p className="alert alert--error">{version.error}</p>}
    </div>
  )
}
