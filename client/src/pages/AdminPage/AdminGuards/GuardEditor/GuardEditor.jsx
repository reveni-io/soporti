import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AUTO_APPROVE_OFF, JEV_GITHUB_DOCUMENT } from '../../../../constants.js'
import { ROUTES } from '../../../../router/constants.js'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import ModalFrame from '../../../../common/ModalFrame/ModalFrame.jsx'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import JevHistory from '../../JevHistory/JevHistory.jsx'
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

export default function GuardEditor({ token, guard, catalog, onLogout, onSaved, onClose }) {
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

  function handleCallsChange(event) {
    const enabled = event.target.checked
    project.updateDraft(draft => ({ ...draft, enabled }))
  }

  function handleSendChange(event) {
    const allowSend = event.target.checked
    project.updateDraft(draft => ({ ...draft, allowSend }))
  }

  async function saveAndRefresh() {
    await project.save()
    onSaved()
  }

  return (
    <ModalFrame title={title} className="guard-modal" onClose={requestClose}>
      {confirmingClose && <DiscardConfirm onDiscard={onClose} onKeep={handleKeepEditing} />}

      <AdminSection title="Settings">
        <label className="admin__switch">
          <input
            type="checkbox"
            checked={project.draft.enabled === true}
            onChange={handleCallsChange}
            disabled={!catalog.keyConfigured && !project.draft.enabled}
          />
          <span className="admin__switch-slider" aria-hidden="true" />
          <span className="admin__switch-label">
            Allow Jev calls
            <span className="admin__muted">
              {isGithub
                ? 'When off, the auto-approve repos decide without Jev: only a trivial PR with nothing blocking is approved.'
                : 'When off, the guard is not offered in the chat and nothing calls Jev for it.'}
            </span>
          </span>
        </label>
        {!catalog.keyConfigured && (
          <p className="admin__muted">
            Save the Jev API key in the Jev section of this page before turning the calls on.
          </p>
        )}

        {isGithub ? (
          <p className="note">
            Soporti asks this guard about the PRs of the repos set to <code>shadow</code> or <code>on</code>. The repos
            and their modes are in <Link to={ROUTES.ADMIN_GITHUB}>Admin → GitHub</Link>. It is not offered in the chat.
          </p>
        ) : (
          <p className="admin__muted">
            Ask for it in any chat, in Slack or over MCP, and in a scheduled query, by its name: for example “pass the
            reply through the {guard.name} guard”. The assistant only uses a guard when it is asked to. A guard never
            blocks anything: it warns, and a person has the last word.
          </p>
        )}

        {!isGithub && (
          <label className="admin__switch">
            <input type="checkbox" checked={project.draft.allowSend === true} onChange={handleSendChange} />
            <span className="admin__switch-slider" aria-hidden="true" />
            <span className="admin__switch-label">
              Allow sending replies from Soporti
              <span className="admin__muted">
                When on, a reply to a Zendesk or HubSpot ticket checked by this guard can be sent from its case in the
                chat, by the person who sends it, after a confirmation.
              </span>
            </span>
          </label>
        )}

        <p className="alert alert--warning">
          A guard sends what it checks to a third party. Review TypeSafe’s data retention before using it.
        </p>
      </AdminSection>

      <AdminSection title="Questions and answers">
        <QuestionSetEditor
          project={guard.id}
          state={project}
          catalog={catalog}
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

      <AdminSection title="Change history">
        <JevHistory key={project.document.rev} token={token} documentId={guard.id} onLogout={onLogout} />
      </AdminSection>

      <DocBar label={title} state={{ ...project, save: saveAndRefresh }} />
    </ModalFrame>
  )
}
