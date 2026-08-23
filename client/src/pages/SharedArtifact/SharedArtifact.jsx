import { useEffect, useRef, useState } from 'react'
import ArtifactBody from '../../common/ArtifactBody/ArtifactBody.jsx'
import GridPattern from '../../common/GridPattern/GridPattern.jsx'
import { getSharedArtifact } from '../../services/services.js'
import './SharedArtifact.css'

export default function SharedArtifact({ shareId }) {
  const [artifact, setArtifact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const frameRef = useRef(null)

  function handleExportPdf() {
    frameRef.current?.print()
  }

  useEffect(() => {
    let active = true

    getSharedArtifact(shareId)
      .then(data => {
        if (active) setArtifact(data)
      })
      .catch(() => {
        if (active) setError('This shared artifact may have expired or the link is invalid.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [shareId])

  return (
    <div className="shared-artifact">
      <GridPattern variant="light" />

      <header className="shared-artifact__header">
        <span className="shared-artifact__brand">Soporti</span>
        <span className="badge">Shared artifact</span>
        {artifact && <span className="shared-artifact__title">{artifact.title}</span>}

        <button
          type="button"
          className="btn btn--secondary btn--sm shared-artifact__pdf"
          onClick={handleExportPdf}
          disabled={!artifact}
          aria-label="Export as PDF"
        >
          PDF
        </button>
      </header>

      <div className="shared-artifact__body">
        <ArtifactBody
          html={artifact?.html ?? ''}
          title={artifact?.title}
          loading={loading}
          error={error}
          frameRef={frameRef}
        />
      </div>

      <footer className="shared-artifact__footer">
        <p>This artifact is temporary. It may expire at any time.</p>
      </footer>
    </div>
  )
}
