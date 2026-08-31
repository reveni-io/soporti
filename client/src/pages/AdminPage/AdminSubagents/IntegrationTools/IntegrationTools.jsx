import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { describeToolCall } from '../../../../common/AgentSteps/tool-steps.js'
import MarkIcon from '../MarkIcon/MarkIcon.jsx'
import { groupIconId } from '../group-icons.js'
import './IntegrationTools.css'

const PANEL_WIDTH = 240
const PANEL_MARGIN = 8

function anchorFor(element) {
  const rect = element.getBoundingClientRect()
  const maxLeft = window.innerWidth - PANEL_WIDTH - PANEL_MARGIN

  return { left: Math.max(PANEL_MARGIN, Math.min(rect.left, maxLeft)), top: rect.bottom + PANEL_MARGIN }
}

export default function IntegrationTools({ group, toolNames }) {
  const [anchor, setAnchor] = useState(null)
  const panelId = useId()

  function show(event) {
    setAnchor(anchorFor(event.currentTarget))
  }

  function hide() {
    setAnchor(null)
  }

  return (
    <div className="integration-tools">
      <button
        className="integration-tools__trigger"
        type="button"
        aria-describedby={panelId}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <MarkIcon id={groupIconId(group.id)} label={group.label} />
        <span className="badge integration-tools__count">{toolNames.length}</span>
      </button>

      {anchor &&
        createPortal(
          <div className="integration-tools__panel" id={panelId} role="tooltip" style={anchor}>
            <span className="integration-tools__title">{group.label}</span>
            <ul className="integration-tools__list">
              {toolNames.map(tool => (
                <li key={tool}>{describeToolCall({ tool }).label}</li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </div>
  )
}
