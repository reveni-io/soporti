import { AUTO_APPROVE_OFF, JEV_GITHUB_DOCUMENT } from '../../../../constants.js'
import { getJevConfig } from '../../../../services/services.js'
import { useAuthedConfig } from '../../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import JevHistory from '../../JevHistory/JevHistory.jsx'
import QuestionSetEditor from '../../QuestionSetEditor/QuestionSetEditor.jsx'
import VersionsTable from '../../VersionsTable/VersionsTable.jsx'
import AutoApproveRepos from '../AutoApproveRepos/AutoApproveRepos.jsx'
import ReviewRules from '../ReviewRules/ReviewRules.jsx'

function describeSetUsers(repos) {
  const users = repos.filter(repo => repo.mode !== AUTO_APPROVE_OFF).map(repo => repo.name)
  if (users.length === 0) return null

  return `Cannot delete the set: ${users.length} auto-approve repo${users.length === 1 ? '' : 's'} (${users.join(', ')}) use it. Set them to off and save first.`
}

export default function GithubAutoApprove({ token, onLogout }) {
  const project = useJevDocument(token, JEV_GITHUB_DOCUMENT, onLogout)
  const { config: catalog, error: catalogError } = useAuthedConfig(getJevConfig, token, onLogout)
  const loadError = catalogError ?? project.loadError

  if (loadError) {
    return (
      <AdminSection title="Auto-approve">
        <p className="alert alert--error">{loadError}</p>
      </AdminSection>
    )
  }
  if (!catalog || !project.document) {
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

      <AdminSection title="Questions and answers for this review">
        <p className="note">
          Mark the answers that block an approval. In repos set to <code>on</code>, when Jev gives one of them, or is
          not sure (confidence below the minimum), the PR is not approved; in <code>shadow</code> it is only logged. In
          GitHub reviews Jev can only veto, never approve.
        </p>
        <QuestionSetEditor
          project={JEV_GITHUB_DOCUMENT}
          state={project}
          catalog={catalog}
          inUseMessage={describeSetUsers(project.document.data.repos)}
        />
      </AdminSection>

      <AdminSection title="Rules">
        <ReviewRules state={project} />
      </AdminSection>

      <AdminSection title="Versions">
        <p className="admin__muted">Versions of the question set of this review.</p>
        <VersionsTable
          key={project.document.setVersion}
          token={token}
          project={JEV_GITHUB_DOCUMENT}
          state={project}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="Change history">
        <JevHistory key={project.document.rev} token={token} documentId={JEV_GITHUB_DOCUMENT} onLogout={onLogout} />
      </AdminSection>

      <DocBar label="GitHub review project" state={project} />
    </>
  )
}
