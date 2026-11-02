import './VideoMeta.css'

export default function VideoMeta({ format, durationSeconds }) {
  return <span className="video-meta">{`${format} · ~${durationSeconds}s`}</span>
}
