import { SUBAGENT_TOOL_PREFIX } from '../../../../constants.js'
import { describeToolCall } from '../../../../common/AgentSteps/tool-steps.js'
import './SubagentTree.css'

function countTools(toolGroups) {
  return toolGroups.reduce((total, group) => total + group.tools.length, 0)
}

function delegatedTools(subagents) {
  const claimed = new Set()

  for (const subagent of subagents) {
    if (!subagent.exclusive || !subagent.enabled) continue

    for (const tool of subagent.tools) claimed.add(tool)
  }

  return claimed.size
}

function describeModel(subagent, globalProvider, globalModel) {
  if (subagent.provider) return `${subagent.provider} / ${subagent.model}`

  return `follows global (${globalProvider} / ${globalModel})`
}

export default function SubagentTree({ subagents, toolGroups, globalProvider, globalModel }) {
  const delegated = delegatedTools(subagents)
  const parentTools = countTools(toolGroups) - delegated

  return (
    <ul className="subagent-tree">
      <li className="subagent-tree__node">
        <span className="subagent-tree__name">Soporti (main agent)</span>
        <span className="subagent-tree__meta">
          {delegated > 0 ? `${parentTools} tools (${delegated} delegated)` : `${parentTools} tools`}
          {' · '}
          {globalProvider} / {globalModel}
        </span>

        <ul className="subagent-tree__children">
          {subagents.map(subagent => (
            <li
              className={subagent.enabled ? 'subagent-tree__node' : 'subagent-tree__node subagent-tree__node--disabled'}
              key={subagent.id}
            >
              <span className="subagent-tree__name">
                {SUBAGENT_TOOL_PREFIX}
                {subagent.name}
              </span>
              {!subagent.enabled && <span className="badge">Disabled</span>}
              <span className="subagent-tree__meta">{describeModel(subagent, globalProvider, globalModel)}</span>
              <span className="subagent-tree__tools">
                {subagent.tools.length} tools
                {subagent.tools.length > 0 &&
                  `: ${subagent.tools.map(tool => describeToolCall({ tool }).label).join(', ')}`}
              </span>
            </li>
          ))}
        </ul>
      </li>
    </ul>
  )
}
