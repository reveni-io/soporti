import { useState } from 'react'
import { Link } from 'react-router-dom'
import VideoMeta from '../../../common/VideoMeta/VideoMeta.jsx'
import { ROUTES } from '../../../router/constants.js'
import './StudioHeader.css'

export default function StudioHeader({ video, busy, onDelete }) {
  return (
    <header className="studio-header">
      <Link className="studio-header__back" to={ROUTES.VIDEOS}>
        &larr; Videos
      </Link>

      <div className="studio-header__heading">
        <h1 className="studio-header__title">{video.title}</h1>
        <VideoMeta format={video.brief.format} durationSeconds={video.brief.durationSeconds} />
      </div>

      <DeleteControl busy={busy} onDelete={onDelete} />
    </header>
  )
}

function DeleteControl({ busy, onDelete }) {
  const [isConfirming, setIsConfirming] = useState(false)

  if (!isConfirming) {
    return (
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setIsConfirming(true)}>
        Delete
      </button>
    )
  }

  return (
    <div className="studio-header__confirm">
      <span className="studio-header__confirm-text">Delete this video?</span>
      <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={onDelete}>
        Yes, delete
      </button>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setIsConfirming(false)}>
        Cancel
      </button>
    </div>
  )
}
