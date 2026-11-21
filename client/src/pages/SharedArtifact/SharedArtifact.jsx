import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ArtifactBody from '../../common/ArtifactBody/ArtifactBody.jsx'
import GridPattern from '../../common/GridPattern/GridPattern.jsx'
import Icon from '../../common/Icon/Icon.jsx'
import { readStoredToken } from '../../context/AuthContext.jsx'
import { ROUTES } from '../../router/constants.js'
import { getSharedArtifact } from '../../services/services.js'
import './SharedArtifact.css'

const BACK_ICON_SIZE = 18

export default function SharedArtifact({ shareId }) {
  const [artifact, setArtifact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const frameRef = useRef(null)
  const isLoggedIn = Boolean(readStoredToken())

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
      <GridPattern variant="surface" />

      <header className="shared-artifact__header">
        {isLoggedIn && (
          <Link className="icon-btn shared-artifact__back" to={ROUTES.CHAT} aria-label="Back to chat">
            <Icon name="arrow-left" size={BACK_ICON_SIZE} />
          </Link>
        )}
        <span className="shared-artifact__brand">Soporti</span>
        <span className="badge shared-artifact__badge">Shared artifact</span>
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
