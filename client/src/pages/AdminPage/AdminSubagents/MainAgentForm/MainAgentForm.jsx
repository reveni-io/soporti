import { useState } from 'react'
import { saveMainAgentTools } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import ToolPicker from '../ToolPicker/ToolPicker.jsx'
import { claimedBy, toggleGroupTools } from '../claimed-tools.js'
import './MainAgentForm.css'

const ALL_TOOLS_HELP =
  'On, the main agent gets every tool of every configured integration, and new integrations are added automatically. Off, it gets exactly what you tick below.'

function everyToolIn(groups) {
  return groups.filter(group => group.configured).flatMap(group => group.tools)
}

export default function MainAgentForm({ token, onLogout, mainAgentTools, subagents, toolGroups, onSaved, onCancel }) {
  const [useEveryTool, setUseEveryTool] = useState(mainAgentTools === null)
  const [tools, setTools] = useState(mainAgentTools ?? everyToolIn(toolGroups))
  const { saving, error, save } = useSaveField(onLogout)

  const claimed = claimedBy(subagents)

  function handleToggle(tool) {
    setTools(current => (current.includes(tool) ? current.filter(name => name !== tool) : [...current, tool]))
  }

  function handleToggleGroup(group) {
    setTools(current => toggleGroupTools(current, group, claimed))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const saved = await save(() => saveMainAgentTools(token, useEveryTool ? null : tools))
    if (saved) await onSaved()
  }

  return (
    <form className="main-agent-form" onSubmit={handleSubmit}>
      <p className="admin__muted">
        Which tools the main agent may use. A tool an exclusive subagent owns is taken from it whatever you pick here,
        and the conversation&apos;s selected sources still apply on top.
      </p>

      {error && <p className="alert alert--error">{error}</p>}

      <label className="main-agent-form__toggle">
        <input type="checkbox" checked={useEveryTool} onChange={() => setUseEveryTool(current => !current)} />
        Use every configured tool
      </label>
      <p className="admin__muted">{ALL_TOOLS_HELP}</p>

      <ToolPicker
        groups={toolGroups}
        selected={useEveryTool ? everyToolIn(toolGroups) : tools}
        claimedBy={claimed}
        disabled={useEveryTool}
        onToggle={handleToggle}
        onToggleGroup={handleToggleGroup}
      />

      <div className="modal__actions">
        <button className="btn btn--secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--primary" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save tools'}
        </button>
      </div>
    </form>
  )
}
