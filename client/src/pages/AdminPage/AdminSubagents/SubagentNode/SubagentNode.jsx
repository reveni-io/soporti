import { SUBAGENT_TOOL_PREFIX } from '../../../../constants.js'
import IntegrationTools from '../IntegrationTools/IntegrationTools.jsx'
import ProviderBadge from '../ProviderBadge/ProviderBadge.jsx'
import './SubagentNode.css'

function describeTools(available, unavailable, exclusive) {
  const owned = `${available} tools · ${exclusive ? 'exclusive' : 'shared'}`

  if (unavailable === 0) return owned

  return `${owned} · ${unavailable} unavailable`
}

export default function SubagentNode({
  subagent,
  groups,
  globalProvider,
  globalModel,
  pendingDelete,
  onEdit,
  onToggleEnabled,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}) {
  const owned = groups.reduce((total, entry) => total + entry.tools.length, 0)
  const toolName = `${SUBAGENT_TOOL_PREFIX}${subagent.name}`

  return (
    <div className={subagent.enabled ? 'subagent-node card' : 'subagent-node subagent-node--disabled card'}>
      <span className="subagent-node__name" title={toolName}>
        {toolName}
      </span>
      <p className="subagent-node__description">{subagent.description}</p>

      <ProviderBadge
        provider={subagent.provider}
        model={subagent.model}
        globalProvider={globalProvider}
        globalModel={globalModel}
      />

      <div className="subagent-node__logos">
        {groups.map(entry => (
          <IntegrationTools group={entry.group} toolNames={entry.tools} key={entry.group.id} />
        ))}
      </div>

      <span className="subagent-node__meta">
        {describeTools(owned, subagent.tools.length - owned, subagent.exclusive)}
        {!subagent.enabled && <span className="badge">Disabled</span>}
      </span>

      <div className="subagent-node__actions">
        <button className="btn btn--secondary btn--sm" onClick={() => onEdit(subagent)}>
          Edit
        </button>
        <button className="btn btn--secondary btn--sm" onClick={() => onToggleEnabled(subagent)}>
          {subagent.enabled ? 'Disable' : 'Enable'}
        </button>
        {pendingDelete ? (
          <>
            <button className="btn btn--danger btn--sm" onClick={() => onDelete(subagent.id)}>
              Confirm
            </button>
            <button className="btn btn--secondary btn--sm" onClick={onCancelDelete}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn btn--danger btn--sm" onClick={() => onRequestDelete(subagent.id)}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
