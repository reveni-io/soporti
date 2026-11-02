import { useVideoPreview } from '../../hooks/useVideoPreview/useVideoPreview.js'
import ScreenFrame from '../ScreenFrame/ScreenFrame.jsx'
import './LivePreview.css'

const SANDBOX = 'allow-scripts'

export default function LivePreview({ token, videoId, version, format, onLogout }) {
  const { html, error } = useVideoPreview({ token, videoId, version, onLogout })

  if (error) return <p className="alert alert--error">{error}</p>
  if (!html) {
    return (
      <ScreenFrame format={format}>
        <p className="live-preview__loading">Loading the live preview…</p>
      </ScreenFrame>
    )
  }

  return (
    <div className="live-preview">
      <ScreenFrame format={format}>
        <iframe title={`Live preview of version ${version}`} srcDoc={html} sandbox={SANDBOX} />
      </ScreenFrame>
      <p className="live-preview__hint">Live preview: click inside it to play with sound.</p>
    </div>
  )
}
