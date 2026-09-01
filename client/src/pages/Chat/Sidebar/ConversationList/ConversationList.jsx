import Icon from '../../../../common/Icon/Icon.jsx'

const UNTITLED_LABEL = 'Untitled conversation'
const SCHEDULED_LABEL = 'Scheduled run'
const STREAMING_LABEL = 'Answering'

export default function ConversationList({ conversations, onSelect, onDelete }) {
  if (conversations.length === 0) return null

  return (
    <div className="sidebar__section sidebar__section--conversations">
      <h2 className="sidebar__section-title">Conversations</h2>
      <ul className="sidebar__conversation-list">
        {conversations.map(conversation => (
          <ConversationItem key={conversation.id} conversation={conversation} onSelect={onSelect} onDelete={onDelete} />
        ))}
      </ul>
    </div>
  )
}

function ConversationItem({ conversation, onSelect, onDelete }) {
  function handleDelete(event) {
    event.stopPropagation()
    onDelete(conversation.id)
  }

  return (
    <li
      className={`sidebar__conversation${conversation.isStreaming ? ' sidebar__conversation--streaming' : ''}`}
      onClick={() => onSelect?.(conversation.id)}
    >
      {conversation.scheduleId && (
        <span className="sidebar__conversation-badge" role="img" aria-label={SCHEDULED_LABEL} title={SCHEDULED_LABEL}>
          <Icon name="clock" size={12} />
        </span>
      )}
      <span className="sidebar__conversation-title">{conversation.title || UNTITLED_LABEL}</span>
      {conversation.isStreaming ? (
        <span className="sidebar__conversation-typing" role="img" aria-label={STREAMING_LABEL} title={STREAMING_LABEL}>
          <span />
          <span />
          <span />
        </span>
      ) : (
        <button className="sidebar__conversation-delete" onClick={handleDelete} aria-label="Delete conversation">
          &times;
        </button>
      )}
    </li>
  )
}
