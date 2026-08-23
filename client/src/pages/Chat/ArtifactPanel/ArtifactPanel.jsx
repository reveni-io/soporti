import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArtifactBody from '../../../common/ArtifactBody/ArtifactBody.jsx'
import ArtifactVersionSelect from '../../../common/ArtifactVersionSelect/ArtifactVersionSelect.jsx'
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const versions = artifact?.versions ?? []
  const canDeleteVersion = versions.length > 1 && version != null
  const actionError = shareError ?? deleteError

  function handleExportPdf() {
    frameRef.current?.print()
  }

  function handleConfirmDelete() {
    setConfirmingDelete(false)
    onDeleteVersion(version)
  }

  return (
    <aside className="artifact-panel">
      <header className="artifact-panel__header">
        <h2 className="artifact-panel__title">{artifact?.title ?? 'Artifact'}</h2>

        <ArtifactVersionSelect
          versions={versions}
          value={version ?? artifact?.latestVersion ?? ''}
          onChange={onSelectVersion}
        />

        {confirmingDelete ? (
          <>
            <button type="button" className="btn btn--danger btn--sm" onClick={handleConfirmDelete}>
              Confirm
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {canDeleteVersion && (
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete this version"
              >
                Delete
              </button>
            )}

            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onShare}
              disabled={!html}
              aria-label="Share artifact"
            >
              Share
            </button>

            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleExportPdf}
              disabled={!html}
              aria-label="Export as PDF"
            >
              PDF
            </button>

            <Link
              className="btn btn--secondary btn--sm"
              to={ROUTES.ARTIFACT.replace(':id', artifactId)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open artifact on its own page"
            >
              Open
            </Link>
          </>
        )}

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
