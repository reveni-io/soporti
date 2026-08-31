import { useCallback, useEffect, useState } from 'react'
import { deleteSubagent, getSubagents, isUnauthorized, updateSubagent } from '../../../services/services.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import MainAgentForm from './MainAgentForm/MainAgentForm.jsx'
import SubagentForm from './SubagentForm/SubagentForm.jsx'
import SubagentFlow from './SubagentFlow/SubagentFlow.jsx'

function toPayload(subagent, changes) {
  return {
    name: subagent.name,
    description: subagent.description,
    instructions: subagent.instructions,
    provider: subagent.provider,
    model: subagent.model,
    tools: subagent.tools,
    exclusive: subagent.exclusive,
    enabled: subagent.enabled,
    ...changes,
  }
}

export default function AdminSubagents({ token, onLogout }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [view, setView] = useState('list')
  const [editingSubagent, setEditingSubagent] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const load = useCallback(async () => {
    try {
      setConfig(await getSubagents(token))
      setLoadError(null)
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, onLogout])

  useEffect(() => {
    load()
  }, [load])

  async function runAction(perform) {
    try {
      await perform()
      setActionError(null)
      await load()
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setActionError(err.message)
    }
  }

  function handleCancelDelete() {
    setPendingDeleteId(null)
  }

  function handleDelete(id) {
    setPendingDeleteId(null)
    runAction(() => deleteSubagent(token, id))
  }

  function handleToggleEnabled(subagent) {
    runAction(() => updateSubagent(token, subagent.id, toPayload(subagent, { enabled: !subagent.enabled })))
  }

  function openMainToolsForm() {
    setView('main-tools')
  }

  function openNewForm() {
    setEditingSubagent(null)
    setView('form')
  }

  function openEditForm(subagent) {
    setEditingSubagent(subagent)
    setView('form')
  }

  async function handleSaved() {
    setView('list')
    await load()
  }

  if (loadError) return <p className="alert alert--error">{loadError}</p>
  if (loading || !config) return <p className="admin__muted">Loading...</p>

  if (view === 'main-tools') {
    return (
      <AdminSection title="Main agent tools">
        <MainAgentForm
          token={token}
          onLogout={onLogout}
          mainAgentTools={config.mainAgentTools}
          subagents={config.subagents}
          toolGroups={config.tools.groups}
          onSaved={handleSaved}
          onCancel={() => setView('list')}
        />
      </AdminSection>
    )
  }

  if (view === 'form') {
    return (
      <AdminSection title={editingSubagent ? 'Edit subagent' : 'New subagent'}>
        <SubagentForm
          token={token}
          onLogout={onLogout}
          subagent={editingSubagent}
          subagents={config.subagents}
          providers={config.providers}
          toolGroups={config.tools.groups}
          onSaved={handleSaved}
          onCancel={() => setView('list')}
        />
      </AdminSection>
    )
  }

  return (
    <AdminSection title="Subagents">
      <p className="admin__muted">
        A subagent is a specialist the assistant can ask. Each one has its own system prompt, its own provider and model
        and its own set of tools, and runs in a context of its own. Take its tools away from the main assistant and
        delegation becomes the only path to them; leave them shared and its description decides when the hand-off
        happens.
      </p>

      {actionError && <p className="alert alert--error">{actionError}</p>}

      <SubagentFlow
        subagents={config.subagents}
        toolGroups={config.tools.groups}
        mainAgentTools={config.mainAgentTools}
        globalProvider={config.globalProvider}
        globalModel={config.globalModel}
        pendingDeleteId={pendingDeleteId}
        actions={{
          onEditMainTools: openMainToolsForm,
          onEdit: openEditForm,
          onToggleEnabled: handleToggleEnabled,
          onRequestDelete: setPendingDeleteId,
          onCancelDelete: handleCancelDelete,
          onDelete: handleDelete,
        }}
      />

      {config.subagents.length === 0 && <p className="admin__muted">No subagents yet.</p>}

      <div className="modal__actions">
        <button className="btn btn--primary" onClick={openNewForm}>
          + New subagent
        </button>
      </div>
    </AdminSection>
  )
}
