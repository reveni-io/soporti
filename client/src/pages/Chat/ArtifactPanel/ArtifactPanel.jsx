import { useRef } from 'react'
import { Link } from 'react-router-dom'
import ArtifactBody from '../../../common/ArtifactBody/ArtifactBody.jsx'
import ArtifactToolbar from '../../../common/ArtifactToolbar/ArtifactToolbar.jsx'
import { ROUTES } from '../../../router/constants.js'
import './ArtifactPanel.css'

export default function ArtifactPanel({
  artifactId,
  artifact,
  html,
  version,
  loading,
  error,
  onSelectVersion,
  onShare,
  shareError,
  onDeleteVersion,
  deleteError,
  onClose,
}) {
  const frameRef = useRef(null)

  const actionError = shareError ?? deleteError

  function handleExportPdf() {
    frameRef.current?.print()
  }

  return (
    <aside className="artifact-panel">
      <header className="artifact-panel__header">
        <h2 className="artifact-panel__title">{artifact?.title ?? 'Artifact'}</h2>

        <ArtifactToolbar
          artifact={artifact}
          version={version}
          hasHtml={Boolean(html)}
          onSelectVersion={onSelectVersion}
          onShare={onShare}
          onExportPdf={handleExportPdf}
          onDeleteVersion={onDeleteVersion}
        >
          <Link
            className="btn btn--secondary btn--sm"
            to={ROUTES.ARTIFACT.replace(':id', artifactId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open artifact on its own page"
          >
            Open
          </Link>
        </ArtifactToolbar>

        <button type="button" className="modal__close" onClick={onClose} aria-label="Close artifact">
          &times;
        </button>
      </header>

      {actionError && <p className="alert alert--error artifact-panel__alert">{actionError}</p>}

      <div className="artifact-panel__body">
        <ArtifactBody html={html} title={artifact?.title} loading={loading} error={error} frameRef={frameRef} />
      </div>
    </aside>
  )
}
