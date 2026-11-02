import { useCallback, useState } from 'react'
import { getVideoFile } from '../../../../services/services.js'
import { useBlobUrl } from '../../../../hooks/useBlobUrl/useBlobUrl.js'
import ScreenFrame from '../ScreenFrame/ScreenFrame.jsx'
import VariantModal from '../VariantModal/VariantModal.jsx'
import { videoFileName } from '../../version-state.js'
import './ReadyView.css'

export default function ReadyView({ video, version, token, onLogout, busy, actions }) {
  const [isCreatingVariant, setIsCreatingVariant] = useState(false)
  const loadVideo = useCallback(
    () => getVideoFile(token, video.id, version.version),
    [token, video.id, version.version]
  )
  const { url, error } = useBlobUrl(loadVideo, onLogout)

  return (
    <div className="ready-view">
      <Player url={url} error={error} format={video.brief.format} version={version.version} />

      <div className="ready-view__actions">
        <DownloadLink url={url} fileName={videoFileName(video.title, version.version)} />
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          onClick={() => actions.share(version.version)}
        >
          Copy link
        </button>
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setIsCreatingVariant(true)}>
          Create variant
        </button>
      </div>

      {isCreatingVariant && (
        <VariantModal
          busy={busy}
          error={actions.error}
          onClose={() => setIsCreatingVariant(false)}
          onSubmit={actions.createVariant}
        />
      )}
    </div>
  )
}

function Player({ url, error, format, version }) {
  if (error) return <p className="alert alert--error">{error}</p>
  if (!url) {
    return (
      <ScreenFrame format={format}>
        <p className="ready-view__loading">Loading the video…</p>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame format={format}>
      <video src={url} controls aria-label={`Version ${version}`} />
    </ScreenFrame>
  )
}

function DownloadLink({ url, fileName }) {
  if (!url) {
    return (
      <button type="button" className="btn btn--primary" disabled>
        Download MP4
      </button>
    )
  }

  return (
    <a className="btn btn--primary" href={url} download={fileName}>
      Download MP4
    </a>
  )
}
