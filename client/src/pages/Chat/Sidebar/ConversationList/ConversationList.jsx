import Icon from '../../../../common/Icon/Icon.jsx'
import { splitOnMatch } from './highlight-match.js'

const UNTITLED_LABEL = 'Untitled conversation'
const SCHEDULED_LABEL = 'Scheduled run'
const STREAMING_LABEL = 'Answering'
const SEARCH_LABEL = 'Search conversations'
const SEARCH_PLACEHOLDER = 'Search conversations...'
const SEARCH_MAX_LENGTH = 200

export default function ConversationList({
  conversations,
  query = '',
  searchedQuery = '',
  onQueryChange,
  selectedId,
  onSelect,
  onDelete,
}) {
  if (conversations.length === 0 && !query && !searchedQuery) return null

  function handleQueryKeyDown(event) {
    if (event.key === 'Escape') onQueryChange('')
  }

  return (
    <div className="sidebar__section sidebar__section--conversations">
      <h2 className="sidebar__section-title">Conversations</h2>
      <input
        type="text"
        className="sidebar__search"
        placeholder={SEARCH_PLACEHOLDER}
        aria-label={SEARCH_LABEL}
        maxLength={SEARCH_MAX_LENGTH}
        value={query}
        onChange={event => onQueryChange(event.target.value)}
        onKeyDown={handleQueryKeyDown}
      />
      <ConversationItems
        conversations={conversations}
        searchedQuery={searchedQuery}
        selectedId={selectedId}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    </div>
  )
}

function ConversationItems({ conversations, searchedQuery, selectedId, onSelect, onDelete }) {
  if (conversations.length === 0) return <p className="sidebar__info">No conversations match "{searchedQuery}"</p>

  return (
    <ul className="sidebar__conversation-list">
      {conversations.map(conversation => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          searchedQuery={searchedQuery}
          isSelected={conversation.id === selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

function ConversationItem({ conversation, searchedQuery, isSelected, onSelect, onDelete }) {
  const className = [
    'sidebar__conversation',
    isSelected && 'sidebar__conversation--selected',
    conversation.isStreaming && 'sidebar__conversation--streaming',
  ]
    .filter(Boolean)
    .join(' ')

  function handleDelete(event) {
    event.stopPropagation()
    onDelete(conversation.id)
  }

  return (
    <li className={className} aria-current={isSelected} onClick={() => onSelect?.(conversation.id)}>
      {conversation.scheduleId && (
        <span className="sidebar__conversation-badge" role="img" aria-label={SCHEDULED_LABEL} title={SCHEDULED_LABEL}>
          <Icon name="clock" size={12} />
        </span>
      )}
      <span className="sidebar__conversation-text">
        <span className="sidebar__conversation-title">{conversation.title || UNTITLED_LABEL}</span>
        {conversation.snippet && <Snippet text={conversation.snippet} query={searchedQuery} />}
      </span>
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

function Snippet({ text, query }) {
  return (
    <span className="sidebar__conversation-snippet">
      {splitOnMatch(text, query).map((segment, index) =>
        segment.isMatch ? (
          <mark key={index} className="sidebar__conversation-match">
            {segment.text}
          </mark>
        ) : (
          segment.text
        )
      )}
    </span>
  )
}
