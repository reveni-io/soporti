import { useState } from 'react'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import ModalFrame from '../../../../common/ModalFrame/ModalFrame.jsx'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import QuestionSetEditor from '../../QuestionSetEditor/QuestionSetEditor.jsx'
import VersionsTable from '../../VersionsTable/VersionsTable.jsx'
import './GuardEditor.css'

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

  function handleNameChange(event) {
    const name = event.target.value
    project.updateDraft(draft => ({ ...draft, name }))
  }

  async function saveAndRefresh() {
    await project.save()
    onSaved()
  }

  return (
    <ModalFrame title={title} className="guard-modal" onClose={requestClose}>
      <div className="guard-modal__body">
        {confirmingClose && <DiscardConfirm onDiscard={onClose} onKeep={handleKeepEditing} />}

        <label className="guard-modal__name">
          Name
          <input className="input" value={project.draft.name ?? guard.name} onChange={handleNameChange} />
        </label>

        <p className="admin__muted">
          The assistant uses this guard when a chat, Slack, MCP, a scheduled query or a bot asks for it, for example
          “use the {guard.name} guards”, and never on its own; the PR reviewer uses it when a repo’s{' '}
          <code>REVIEW.md</code> names it. A guard never blocks anything: it warns, and a person has the last word.
        </p>

        <AdminSection title="Questions and answers">
          <QuestionSetEditor project={guard.id} state={project} />
        </AdminSection>

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
