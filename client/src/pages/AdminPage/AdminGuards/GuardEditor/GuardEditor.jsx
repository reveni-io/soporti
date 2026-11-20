import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AUTO_APPROVE_OFF, JEV_GITHUB_DOCUMENT } from '../../../../constants.js'
import { deleteGuard } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { useJevDocument } from '../../hooks/useJevDocument/useJevDocument.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'
import DocBar from '../../DocBar/DocBar.jsx'
import JevHistory from '../../JevHistory/JevHistory.jsx'
import QuestionSetEditor from '../../QuestionSetEditor/QuestionSetEditor.jsx'
import VersionsTable from '../../VersionsTable/VersionsTable.jsx'
import './GuardEditor.css'

const MAX_NAME_LENGTH = 60

function describeSetUsers({ set, repos }) {
  if (!repos || set.questions.length === 0) return null

  const users = repos.filter(repo => repo.mode !== AUTO_APPROVE_OFF).map(repo => repo.name)
  if (users.length === 0) return null

  return `Cannot delete the set: ${users.length} auto-approve repo${users.length === 1 ? '' : 's'} (${users.join(', ')}) use it. Set them to off in Admin → GitHub and save first.`
}

export default function GuardEditor({ token, guard, catalog, onLogout, onSaved, onDeleted }) {
  const project = useJevDocument(token, guard.id, onLogout)
  const isGithub = guard.id === JEV_GITHUB_DOCUMENT

  if (project.loadError) {
    return (
      <AdminSection title={guard.name}>
        <p className="alert alert--error">{project.loadError}</p>
      </AdminSection>
    )
  }
  if (!project.document) {
    return (
      <AdminSection title={guard.name}>
        <p className="admin__muted">Loading...</p>
      </AdminSection>
    )
  }

  function handleNameChange(event) {
    const name = event.target.value
    project.updateDraft(draft => ({ ...draft, name }))
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
    <>
      <AdminSection title={`${guard.name} guard`}>
        {guard.builtIn ? (
          <p className="admin__muted">A built-in guard: it cannot be renamed or deleted.</p>
        ) : (
          <label className="guard-editor__label">
            Name
            <input
              className="input"
              maxLength={MAX_NAME_LENGTH}
              value={project.draft.name}
              onChange={handleNameChange}
            />
          </label>
        )}

        {isGithub ? (
          <p className="note">
            Soporti asks this guard about the PRs of the repos set to <code>shadow</code> or <code>on</code>. The repos,
            their modes and the rules are in <Link to="/admin/github">Admin → GitHub</Link>. It is not offered in the
            chat.
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

        {!guard.builtIn && <DeleteGuard token={token} guard={guard} onLogout={onLogout} onDeleted={onDeleted} />}
      </AdminSection>

      <AdminSection title="Questions and answers">
        <QuestionSetEditor
          project={guard.id}
          state={project}
          catalog={catalog}
          inUseMessage={isGithub ? describeSetUsers(project.draft) : null}
        />
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

      <DocBar label={`${guard.name} guard`} state={{ ...project, save: saveAndRefresh }} />
    </>
  )
}

function DeleteGuard({ token, guard, onLogout, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const { saving, error, save } = useSaveField(onLogout)

  function handleAsk() {
    setConfirming(true)
  }

  function handleCancel() {
    setConfirming(false)
  }

  function handleDelete() {
    save(async () => {
      await deleteGuard(token, guard.id)
      onDeleted()
    })
  }

  return (
    <>
      <div className="admin__form admin__form--row">
        {confirming ? (
          <>
            <span className="admin__muted">Delete the {guard.name} guard? Its cases stay in their conversations.</span>
            <button className="btn btn--danger" type="button" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete guard'}
            </button>
            <button className="btn btn--secondary" type="button" onClick={handleCancel}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn btn--secondary" type="button" onClick={handleAsk}>
            Delete…
          </button>
        )}
      </div>
      {error && <p className="alert alert--error">{error}</p>}
    </>
  )
}
