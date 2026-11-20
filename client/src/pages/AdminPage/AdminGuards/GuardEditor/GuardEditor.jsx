import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AUTO_APPROVE_OFF, JEV_GITHUB_DOCUMENT } from '../../../../constants.js'
import { ROUTES } from '../../../../router/constants.js'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import ModalFrame from '../../../../common/ModalFrame/ModalFrame.jsx'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import QuestionSetEditor from '../../QuestionSetEditor/QuestionSetEditor.jsx'
import VersionsTable from '../../VersionsTable/VersionsTable.jsx'
import ReviewRules from '../ReviewRules/ReviewRules.jsx'
import './GuardEditor.css'

function describeSetUsers({ set, repos }) {
  if (!repos || set.questions.length === 0) return null

  const users = repos.filter(repo => repo.mode !== AUTO_APPROVE_OFF).map(repo => repo.name)
  if (users.length === 0) return null

  return `Cannot delete the set: ${users.length} auto-approve repo${users.length === 1 ? '' : 's'} (${users.join(', ')}) use it. Set them to off in Admin → GitHub and save first.`
}

function DiscardConfirm({ onDiscard, onKeep }) {
  return (
    <div className="alert alert--warning guard-modal__confirm" role="group" aria-label="Unsaved changes">
      <span>This guard has unsaved changes.</span>
      <button type="button" className="btn btn--danger btn--sm" onClick={onDiscard}>
        Discard changes
      </button>
      <button type="button" className="btn btn--secondary btn--sm" autoFocus onClick={onKeep}>
        Keep editing
      </button>
    </div>
  )
}

export default function GuardEditor({ token, guard, onLogout, onSaved, onClose }) {
  const project = useJevDocument(token, guard.id, onLogout)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const isGithub = guard.id === JEV_GITHUB_DOCUMENT
  const title = `${guard.name} guard`

  if (project.loadError) {
    return (
      <ModalFrame title={title} className="guard-modal" onClose={onClose}>
        <p className="alert alert--error">{project.loadError}</p>
      </ModalFrame>
    )
  }
  if (!project.document) {
    return (
      <ModalFrame title={title} className="guard-modal" onClose={onClose}>
        <p className="admin__muted">Loading...</p>
      </ModalFrame>
    )
  }

  function requestClose() {
    if (project.dirty) setConfirmingClose(true)
    else onClose()
  }

  function handleKeepEditing() {
    setConfirmingClose(false)
  }

  async function saveAndRefresh() {
    await project.save()
    onSaved()
  }

  return (
    <ModalFrame title={title} className="guard-modal" onClose={requestClose}>
      <div className="guard-modal__body">
        {confirmingClose && <DiscardConfirm onDiscard={onClose} onKeep={handleKeepEditing} />}

        {isGithub ? (
          <p className="note">
            Soporti asks this guard about the PRs of the repos set to <code>shadow</code> or <code>on</code>. The repos
            and their modes are in <Link to={ROUTES.ADMIN_GITHUB}>Admin → GitHub</Link>. It is not offered in the chat.
          </p>
        ) : (
          <p className="admin__muted">
            Ask for it in any chat, in Slack or over MCP, and in a scheduled query, by its name: for example “pass the
            reply through the {guard.name} guard”. A guard never blocks anything: it warns, and a person has the last
            word.
          </p>
        )}

        <AdminSection title="Questions and answers">
          <QuestionSetEditor
            project={guard.id}
            state={project}
            inUseMessage={isGithub ? describeSetUsers(project.draft) : null}
          />
        </AdminSection>

        {isGithub && (
          <AdminSection title="Rules">
            <ReviewRules state={project} />
          </AdminSection>
        )}

        <AdminSection title="Versions">
          <p className="admin__muted">Versions of the questions of this guard and how many calls used each one.</p>
          <VersionsTable
            key={project.document.setVersion}
            token={token}
            project={guard.id}
            state={project}
            onLogout={onLogout}
            withCalls
          />
        </AdminSection>
      </div>

      <DocBar label={title} state={{ ...project, save: saveAndRefresh }} />
    </ModalFrame>
  )
}
