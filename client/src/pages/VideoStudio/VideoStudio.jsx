import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useVideo } from './hooks/useVideo/useVideo.js'
import { useVideoActions } from './hooks/useVideoActions/useVideoActions.js'
import { ROUTES } from '../../router/constants.js'
import StudioHeader from './StudioHeader/StudioHeader.jsx'
import VideoConversation from './VideoConversation/VideoConversation.jsx'
import StudioPanel from './StudioPanel/StudioPanel.jsx'
import './VideoStudio.css'

export default function VideoStudio({ id }) {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const { video, loading, error, replaceVideo } = useVideo(token, id, logout)
  const actions = useVideoActions({ token, id, onLogout: logout, onVideo: replaceVideo })

  async function handleDelete() {
    if (await actions.remove()) navigate(ROUTES.VIDEOS)
  }

  if (loading) return <p className="video-studio__notice">Loading the video…</p>
  if (!video) {
    return (
      <div className="video-studio__notice">
        <p className="alert alert--error">{error}</p>
        <Link to={ROUTES.VIDEOS}>Back to videos</Link>
      </div>
    )
  }

  return (
    <div className="video-studio">
      <StudioHeader video={video} busy={actions.busy} onDelete={handleDelete} />

      {actions.error && <p className="alert alert--error video-studio__alert">{actions.error}</p>}

      <div className="video-studio__columns">
        <VideoConversation
          video={video}
          token={token}
          busy={actions.busy}
          onSend={actions.sendMessage}
          onRetry={actions.redraft}
        />

        <section className="video-studio__panel" aria-label="Storyboard">
          <StudioPanel video={video} busy={actions.busy} onGenerate={actions.generate} />
        </section>
      </div>
    </div>
  )
}
