import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import VideoMeta from '../../../../common/VideoMeta/VideoMeta.jsx'
import VideoStatusBadge from '../../../../common/VideoStatusBadge/VideoStatusBadge.jsx'
import ProgressBar from '../../../../common/ProgressBar/ProgressBar.jsx'
import { getVideoThumbnail } from '../../../../services/services.js'
import { useBlobUrl } from '../../../../hooks/useBlobUrl/useBlobUrl.js'
import { ROUTES } from '../../../../router/constants.js'
import './VideoCard.css'

const DATE_OPTIONS = { dateStyle: 'medium' }
const RUNNING_STATUS = 'running'

export default function VideoCard({ video, token, onLogout }) {
  const { id, thumbnailVersion } = video
  const loadThumbnail = useCallback(() => getVideoThumbnail(token, id, thumbnailVersion), [token, id, thumbnailVersion])
  const { url } = useBlobUrl(thumbnailVersion == null ? null : loadThumbnail, onLogout)
  const showsProgress = video.status === RUNNING_STATUS && video.progress != null

  return (
    <li className="card video-card">
      <Link className="video-card__link" to={ROUTES.VIDEO.replace(':id', id)}>
        <div className="video-card__media">
          <div className="video-card__thumbnail" aria-hidden="true">
            {url && <img className="video-card__image" src={url} alt="" />}
          </div>
          {showsProgress && <ProgressBar value={video.progress} label={`Progress of ${video.title}`} />}
        </div>

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
