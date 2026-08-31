import { describeToolCall } from '../../../../common/AgentSteps/tool-steps.js'
import { isGroupSelected } from '../claimed-tools.js'
import MarkIcon from '../MarkIcon/MarkIcon.jsx'
import { groupIconId } from '../group-icons.js'
import './ToolPicker.css'

export default function ToolPicker({ groups, selected, claimedBy, disabled, onToggle, onToggleGroup }) {
  return (
    <ul className="tool-picker">
      {groups.map(group => (
        <li className="tool-picker__group" key={group.id}>
          <div className="tool-picker__group-head">
            <MarkIcon id={groupIconId(group.id)} label={group.label} />
            <span className={group.configured ? 'tool-picker__group-name' : 'tool-picker__group-name admin__muted'}>
              {group.label}
            </span>
            {!group.configured && <span className="tool-picker__note">Configure it first</span>}
            <button
              className="btn btn--secondary btn--sm"
              type="button"
              disabled={disabled}
              onClick={() => onToggleGroup(group)}
            >
              {isGroupSelected(group, claimedBy, selected) ? 'Clear' : 'Select all'}
            </button>
          </div>

          <ul className="tool-picker__tools">
            {group.tools.map(tool => (
              <li className="tool-picker__tool" key={tool}>
                <label className="tool-picker__label">
                  <input
                    type="checkbox"
                    checked={selected.includes(tool)}
                    disabled={disabled || Boolean(claimedBy[tool])}
                    onChange={() => onToggle(tool)}
                  />
                  {describeToolCall({ tool }).label}
                </label>
                {claimedBy[tool] && <span className="tool-picker__note">Taken by {claimedBy[tool]}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
