import { Link } from 'react-router-dom'
import VideoMeta from '../../../../common/VideoMeta/VideoMeta.jsx'
import VideoStatusBadge from '../../../../common/VideoStatusBadge/VideoStatusBadge.jsx'
import { ROUTES } from '../../../../router/constants.js'
import './VideoCard.css'

const DATE_OPTIONS = { dateStyle: 'medium' }

export default function VideoCard({ video }) {
  return (
    <li className="card video-card">
      <Link className="video-card__link" to={ROUTES.VIDEO.replace(':id', video.id)}>
        <div className="video-card__thumbnail" aria-hidden="true" />

        <div className="video-card__body">
          <h2 className="video-card__title">{video.title}</h2>
          <VideoMeta format={video.format} durationSeconds={video.durationSeconds} />

          <div className="video-card__footer">
            <VideoStatusBadge status={video.status} phase={video.phase} progress={video.progress} />
            <time className="video-card__date" dateTime={video.updatedAt}>
              {new Date(video.updatedAt).toLocaleDateString([], DATE_OPTIONS)}
            </time>
          </div>
        </div>
      </Link>
    </li>
  )
}
