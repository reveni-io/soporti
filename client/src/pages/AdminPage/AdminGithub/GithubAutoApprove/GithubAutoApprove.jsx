import { Link } from 'react-router-dom'
import { AUTO_APPROVE_DOCUMENT } from '../../../../constants.js'
import { ROUTES } from '../../../../router/constants.js'
import { useRepos } from '../../../../hooks/useRepos/useRepos.js'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import AutoApproveRepos from '../AutoApproveRepos/AutoApproveRepos.jsx'

export default function GithubAutoApprove({ token, onLogout }) {
  const project = useJevDocument(token, AUTO_APPROVE_DOCUMENT, onLogout)
  const { repos: readableRepos } = useRepos(token, onLogout)

  if (project.loadError) {
    return (
      <AdminSection title="Auto-approve">
        <p className="alert alert--error">{project.loadError}</p>
      </AdminSection>
    )
  }
  if (!project.document) {
    return (
      <AdminSection title="Auto-approve">
        <p className="admin__muted">Loading...</p>
      </AdminSection>
    )
  }

  return (
    <>
      <AdminSection title="Auto-approve repos">
        <p className="note">
          A repo is checked by the guards its <code>REVIEW.md</code> names, for example “Use the guards: GitHub Review
          PR”. Without a <code>REVIEW.md</code>, or when it names no guard, a repo is never approved. The guards are in{' '}
          <Link to={ROUTES.ADMIN_GUARDS}>Admin → Guards</Link>.
        </p>
        <AutoApproveRepos
          key={project.document.rev}
          token={token}
          state={project}
          readableRepos={readableRepos}
          onLogout={onLogout}
        />
      </AdminSection>

      <DocBar label="Auto-approve repos" state={project} />
    </>
  )
}
