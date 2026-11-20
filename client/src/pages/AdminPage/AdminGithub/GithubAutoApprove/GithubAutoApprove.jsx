import { Link } from 'react-router-dom'
import { JEV_GITHUB_DOCUMENT } from '../../../../constants.js'
import { ROUTES } from '../../../../router/constants.js'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import AutoApproveRepos from '../AutoApproveRepos/AutoApproveRepos.jsx'

export default function GithubAutoApprove({ token, onLogout }) {
  const project = useJevDocument(token, JEV_GITHUB_DOCUMENT, onLogout)

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
          The questions and rules Jev answers about the PRs of these repos, and each repo’s denylist, are in the{' '}
          <Link to={`${ROUTES.ADMIN_GUARDS}?guard=${JEV_GITHUB_DOCUMENT}`}>GitHub PRs guard</Link>. Jev can only veto,
          never approve.
        </p>
        <AutoApproveRepos key={project.document.rev} token={token} state={project} onLogout={onLogout} />
      </AdminSection>

      <DocBar label="GitHub review project" state={project} />
    </>
  )
}
