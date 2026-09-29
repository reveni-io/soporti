import { useRef } from 'react'
import { Link } from 'react-router-dom'
import ArtifactBody from '../../common/ArtifactBody/ArtifactBody.jsx'
import GridPattern from '../../common/GridPattern/GridPattern.jsx'
import ArtifactToolbar from '../../common/ArtifactToolbar/ArtifactToolbar.jsx'
import ShareModal from '../../common/ShareModal/ShareModal.jsx'
import Login from '../../common/Login/Login.jsx'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'
import { useArtifact } from '../../hooks/useArtifact/useArtifact.js'
import { useArtifactShare } from '../../hooks/useArtifactShare/useArtifactShare.js'
import { ROUTES } from '../../router/constants.js'
import './ArtifactView.css'

export default function ArtifactView({ id }) {
  const {
    token,
    isAuthenticated,
    loginWithGoogle,
    loginWithPassword,
    logout,
    error: authError,
    isLoggingIn,
  } = useAuth()
  const authMethods = useAuthMethods()
  const { artifact, html, version, loading, error, deleteError, selectVersion, removeVersion } = useArtifact(
    token,
    id,
    logout
  )
  const { shareUrl, error: shareError, share, dismiss } = useArtifactShare(token, logout)
  const frameRef = useRef(null)

  const actionError = shareError ?? deleteError

  function handleExportPdf() {
    frameRef.current?.print()
  }

  if (!isAuthenticated) {
    return (
      <Login
        onLogin={authMethods?.google ? loginWithGoogle : undefined}
        onPasswordLogin={authMethods?.password ? loginWithPassword : undefined}
        error={authError}
        isLoading={isLoggingIn || authMethods === null}
      />
    )
  }

  return (
    <div className="artifact-view">
      <GridPattern variant="light" />

      <header className="artifact-view__header">
        <Link className="artifact-view__back" to={ROUTES.CHAT}>
          Soporti
        </Link>
        <h1 className="artifact-view__title">{artifact?.title ?? 'Artifact'}</h1>

        <ArtifactToolbar
          artifact={artifact}
          version={version}
          hasHtml={Boolean(html)}
          onSelectVersion={selectVersion}
          onShare={() => share(id, version)}
          onExportPdf={handleExportPdf}
          onDeleteVersion={removeVersion}
        />
      </header>

      {actionError && <p className="alert alert--error artifact-view__alert">{actionError}</p>}

      <div className="artifact-view__body">
        <ArtifactBody html={html} title={artifact?.title} loading={loading} error={error} frameRef={frameRef} />
      </div>

      {shareUrl && <ShareModal url={shareUrl} title="Share artifact" onClose={dismiss} />}
    </div>
  )
}
