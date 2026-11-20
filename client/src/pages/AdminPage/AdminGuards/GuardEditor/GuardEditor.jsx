import { useState } from 'react'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import ModalFrame from '../../../../common/ModalFrame/ModalFrame.jsx'
import DeleteControl from '../../../../common/DeleteControl/DeleteControl.jsx'
import { deleteGuard } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import JevHistory from '../../JevHistory/JevHistory.jsx'
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

function GuardDelete({ token, guard, onLogout, onDeleted }) {
  const { saving, error, save } = useSaveField(onLogout)

  async function handleDelete() {
    if (await save(() => deleteGuard(token, guard.id))) onDeleted()
  }

  return (
    <AdminSection title="Delete guard">
      {error && <p className="alert alert--error">{error}</p>}
      <DeleteControl
        label="Delete guard"
        question={`Delete the ${guard.name} guard? Its questions, versions and history go with it.`}
        busy={saving}
        onDelete={handleDelete}
      />
    </AdminSection>
  )
}

export default function GuardEditor({ token, guard, catalog, onLogout, onSaved, onClose, onDeleted }) {
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
      {confirmingClose && <DiscardConfirm onDiscard={onClose} onKeep={handleKeepEditing} />}

      <label className="guard-modal__name">
        Name
        <input className="input" value={project.draft.name ?? guard.name} onChange={handleNameChange} />
      </label>

      <p className="admin__muted">
        The assistant uses this guard when a chat, Slack, MCP, a scheduled query or a bot asks for it, for example “use
        the {guard.name} guards”, and the PR reviewer uses it when a repo’s <code>REVIEW.md</code> names it. A guard
        never blocks anything on its own: it warns, and a person has the last word.
      </p>

      <AdminSection title="Questions and answers">
        <QuestionSetEditor project={guard.id} state={project} catalog={catalog} />
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

      <AdminSection title="Change history">
        <JevHistory key={project.document.rev} token={token} documentId={guard.id} onLogout={onLogout} />
      </AdminSection>

      <GuardDelete token={token} guard={guard} onLogout={onLogout} onDeleted={onDeleted} />

      <DocBar label={title} state={{ ...project, save: saveAndRefresh }} />
    </ModalFrame>
  )
}
