import { useRef, useState } from 'react'
import Icon from '../../../../common/Icon/Icon.jsx'
import SidebarSearch from '../SidebarSearch/SidebarSearch.jsx'
import { splitOnMatch } from './highlight-match.js'
import './ConversationList.css'

const UNTITLED_LABEL = 'Untitled conversation'
const SCHEDULED_LABEL = 'Scheduled run'
const STREAMING_LABEL = 'Answering'
const SEARCH_LABEL = 'Search conversations'
const SEARCH_PLACEHOLDER = 'Search conversations...'
const SEARCH_MAX_LENGTH = 200
const BADGE_ICON_SIZE = 12
const DELETE_ICON_SIZE = 13
const CONFIRM_LABEL = 'Delete this conversation?'
const TOUCH_POINTER = 'touch'

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

  return (
    <div className="sidebar__section sidebar__section--list conversation-list">
      <h2 className="sidebar__section-title">Conversations</h2>
      <SidebarSearch
        value={query}
        label={SEARCH_LABEL}
        placeholder={SEARCH_PLACEHOLDER}
        maxLength={SEARCH_MAX_LENGTH}
        onChange={onQueryChange}
      />
      <div className="sidebar__scroll">
        <ConversationItems
          conversations={conversations}
          searchedQuery={searchedQuery}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

function ConversationItems({ conversations, searchedQuery, selectedId, onSelect, onDelete }) {
  if (conversations.length === 0) return <p className="sidebar__info">No conversations match "{searchedQuery}"</p>

  return (
    <ul className="conversation-list__items">
      {conversations.map((conversation, index) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          index={index}
          searchedQuery={searchedQuery}
          isSelected={conversation.id === selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

function ConversationItem({ conversation, index, searchedQuery, isSelected, onSelect, onDelete }) {
  const className = [
    'conversation-list__item',
    isSelected && 'conversation-list__item--selected',
    conversation.isStreaming && 'conversation-list__item--streaming',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={className} style={{ '--conversation-index': index }}>
      <button
        type="button"
        className="conversation-list__open"
        aria-current={isSelected}
        onClick={() => onSelect?.(conversation.id)}
      >
        {conversation.scheduleId && (
          <span className="conversation-list__badge" role="img" aria-label={SCHEDULED_LABEL} title={SCHEDULED_LABEL}>
            <Icon name="clock" size={BADGE_ICON_SIZE} />
          </span>
        )}
        <span className="conversation-list__text">
          <span className="conversation-list__title">{conversation.title || UNTITLED_LABEL}</span>
          {conversation.snippet && <Snippet text={conversation.snippet} query={searchedQuery} />}
        </span>
      </button>
      <ConversationAction isStreaming={conversation.isStreaming} onDelete={() => onDelete(conversation.id)} />
    </li>
  )
}

function ConversationAction({ isStreaming, onDelete }) {
  const [isConfirming, setIsConfirming] = useState(false)
  const pointerTypeRef = useRef(null)

  function handlePointerDown(event) {
    pointerTypeRef.current = event.pointerType
  }

  function handleDelete() {
    if (pointerTypeRef.current === TOUCH_POINTER) {
      setIsConfirming(true)
      return
    }
    onDelete()
  }

  if (isStreaming) {
    return (
      <span className="conversation-list__typing" role="img" aria-label={STREAMING_LABEL} title={STREAMING_LABEL}>
        <span />
        <span />
        <span />
      </span>
    )
  }

  if (isConfirming) {
    return (
      <span className="conversation-list__confirm" role="group" aria-label={CONFIRM_LABEL}>
        <button type="button" className="conversation-list__confirm-delete" onClick={onDelete}>
          Delete
        </button>
        <button
          type="button"
          className="conversation-list__confirm-cancel"
          onClick={() => setIsConfirming(false)}
          aria-label="Keep it"
        >
          <Icon name="close" size={DELETE_ICON_SIZE} />
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      className="conversation-list__delete"
      onPointerDown={handlePointerDown}
      onClick={handleDelete}
      aria-label="Delete conversation"
    >
      <Icon name="trash" size={DELETE_ICON_SIZE} />
    </button>
  )
}

function Snippet({ text, query }) {
  return (
    <span className="conversation-list__snippet">
      {splitOnMatch(text, query).map((segment, index) =>
        segment.isMatch ? (
          <mark key={index} className="conversation-list__match">
            {segment.text}
          </mark>
        ) : (
          segment.text
        )
      )}
    </span>
  )
}
