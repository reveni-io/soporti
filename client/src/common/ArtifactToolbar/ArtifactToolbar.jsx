import { useState } from 'react'
import ArtifactVersionSelect from '../ArtifactVersionSelect/ArtifactVersionSelect.jsx'

export default function ArtifactToolbar({
  artifact,
  version,
  hasHtml,
  onSelectVersion,
  onShare,
  onExportPdf,
  onDeleteVersion,
  children,
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const versions = artifact?.versions ?? []
  const canDeleteVersion = versions.length > 1 && version != null

  function handleConfirmDelete() {
    setConfirmingDelete(false)
    onDeleteVersion(version)
  }

  return (
    <>
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
            disabled={!hasHtml}
            aria-label="Share artifact"
          >
            Share
          </button>

          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onExportPdf}
            disabled={!hasHtml}
            aria-label="Export as PDF"
          >
            PDF
          </button>

          {children}
        </>
      )}
    </>
  )
}
