import { useState } from 'react'
import { Link } from 'react-router-dom'
import ShareModal from '../../../common/ShareModal/ShareModal.jsx'
import { useOverlayDismiss } from '../../../hooks/useOverlayDismiss/useOverlayDismiss.js'
import { deleteArtifact, isUnauthorized } from '../../../services/services.js'
import { useArtifactShare } from '../../../hooks/useArtifactShare/useArtifactShare.js'
import { useArtifactList } from '../hooks/useArtifactList/useArtifactList.js'
import { ROUTES } from '../../../router/constants.js'
import { formatUpdatedAt } from './format-updated-at.js'
import './ArtifactsModal.css'

export default function ArtifactsModal({ token, onClose, onLogout, onDeleted }) {
  const { artifacts, loading, error: loadError, reload } = useArtifactList(token, onLogout)
  const [actionError, setActionError] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const { shareUrl, error: shareError, share, dismiss } = useArtifactShare(token, onLogout)
  const overlayProps = useOverlayDismiss(onClose)

  const error = actionError ?? shareError ?? loadError

  async function handleDelete(id) {
    setActionError(null)
    try {
      await deleteArtifact(token, id)
      setPendingDeleteId(null)
      onDeleted?.(id)
      await reload()
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setActionError(err.message)
    }
  }

  return (
    <div className="modal-overlay" {...overlayProps}>
      <div className="modal artifacts-modal">
        <div className="modal__header">
          <h3 className="modal__title">Artifacts</h3>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <p className="artifacts-modal__description">
          Artifacts are the pages Soporti builds beside a conversation — documents, reports, runbooks, dashboards. Open
          one on its own page, share it with a temporary link, or delete it for good.
        </p>

        {loading && <p className="artifacts-modal__status">Loading…</p>}
        {error && <p className="alert alert--error">{error}</p>}
        {!loading && !error && artifacts.length === 0 && <p className="artifacts-modal__empty">No artifacts yet.</p>}

        <ul className="artifacts-modal__list">
          {artifacts.map(artifact => (
            <li key={artifact.id} className="card artifacts-modal__item">
              <div className="artifacts-modal__item-info">
                <span className="artifacts-modal__item-name">{artifact.title}</span>
                <span className="artifacts-modal__item-meta">
                  {artifact.versionCount === 1 ? '1 version' : `${artifact.versionCount} versions`} ·{' '}
                  {formatUpdatedAt(artifact.updatedAt)}
                </span>
              </div>

              <div className="artifacts-modal__item-actions">
                {pendingDeleteId === artifact.id ? (
                  <>
                    <button className="btn btn--danger btn--sm" onClick={() => handleDelete(artifact.id)}>
                      Confirm
                    </button>
                    <button className="btn btn--secondary btn--sm" onClick={() => setPendingDeleteId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      className="btn btn--secondary btn--sm"
                      to={ROUTES.ARTIFACT.replace(':id', artifact.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open
                    </Link>
                    <button className="btn btn--secondary btn--sm" onClick={() => share(artifact.id)}>
                      Share
                    </button>
                    <button className="btn btn--danger btn--sm" onClick={() => setPendingDeleteId(artifact.id)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {shareUrl && <ShareModal url={shareUrl} title="Share artifact" onClose={dismiss} />}
    </div>
  )
}
