import VideoCard from './VideoCard/VideoCard.jsx'
import './VideoGrid.css'

export default function VideoGrid({ videos, loading, error }) {
  if (loading) return <p className="video-grid__status">Loading your videos…</p>
  if (error) return <p className="alert alert--error">{error}</p>
  if (videos.length === 0) {
    return <p className="video-grid__status">No videos yet. Press New video to write the first brief.</p>
  }

  return (
    <ul className="video-grid">
      {videos.map(video => (
        <VideoCard key={video.id} video={video} />
      ))}
    </ul>
  )
}
