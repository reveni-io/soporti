import { Link } from 'react-router-dom'
import { JEV_GITHUB_DOCUMENT } from '../../../../constants.js'
import { ROUTES } from '../../../../router/constants.js'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import AutoApproveRepos from '../AutoApproveRepos/AutoApproveRepos.jsx'
import ReviewRules from '../ReviewRules/ReviewRules.jsx'

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
        <AutoApproveRepos key={project.document.rev} token={token} state={project} onLogout={onLogout} />
      </AdminSection>

      <AdminSection title="Questions for this review">
        <p className="note">
          The questions Jev answers about each PR, with their model, versions and history, are in the{' '}
          <Link to={`${ROUTES.ADMIN_GUARDS}?guard=${JEV_GITHUB_DOCUMENT}`}>GitHub PRs guard</Link>. In repos set to{' '}
          <code>on</code>, an answer that vetoes, or one Jev is not sure about, keeps the PR from being approved; in{' '}
          <code>shadow</code> it is only logged. Jev can only veto, never approve.
        </p>
      </AdminSection>

      <AdminSection title="Rules">
        <ReviewRules state={project} />
      </AdminSection>

      <DocBar label="GitHub review project" state={project} />
    </>
  )
}
