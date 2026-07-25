const UNTITLED_LABEL = 'Untitled conversation'

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
    <li className="sidebar__conversation" onClick={() => onSelect?.(conversation.id)}>
      <span className="sidebar__conversation-title">{conversation.title || UNTITLED_LABEL}</span>
      <button className="sidebar__conversation-delete" onClick={handleDelete} aria-label="Delete conversation">
        &times;
      </button>
    </li>
  )
}
