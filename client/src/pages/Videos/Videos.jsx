import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useVideos } from '../../hooks/useVideos/useVideos.js'
import { ROUTES } from '../../router/constants.js'
import VideoGrid from './VideoGrid/VideoGrid.jsx'
import NewVideoModal from './NewVideoModal/NewVideoModal.jsx'
import './Videos.css'

export default function Videos() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const { videos, loading, error } = useVideos(token, logout)
  const [isCreating, setIsCreating] = useState(false)

  function handleCreated(video) {
    navigate(ROUTES.VIDEO.replace(':id', video.id))
  }

  return (
    <div className="videos">
      <header className="videos__header">
        <Link className="videos__back" to={ROUTES.CHAT}>
          &larr; Chat
        </Link>
        <h1 className="videos__title">Videos</h1>
        <button type="button" className="btn btn--primary" onClick={() => setIsCreating(true)}>
          New video
        </button>
      </header>

      <main className="videos__body">
        <VideoGrid videos={videos} loading={loading} error={error} token={token} onLogout={logout} />
      </main>

      {isCreating && (
        <NewVideoModal token={token} onLogout={logout} onClose={() => setIsCreating(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
