import { formatTime } from '../format-time.js'
import { useTicketConversation } from '../hooks/useTicketConversation/useTicketConversation.js'
import './TicketConversation.css'

function authorOf(message) {
  if (message.author) return message.author

  return message.fromCustomer ? 'Customer' : 'Agent'
}

export default function TicketConversation({ token, legalCase, onLogout }) {
  const conversation = useTicketConversation(token, legalCase.id, onLogout)

  if (!conversation.messages) {
    return (
      <div className="ticket-conversation">
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={conversation.load}
          disabled={conversation.loading}
        >
          {conversation.loading ? 'Loading...' : 'Show the ticket conversation'}
        </button>
        {conversation.error && <p className="alert alert--error">{conversation.error}</p>}
      </div>
    )
  }

  return (
    <div className="ticket-conversation">
      <div className="ticket-conversation__head">
        <span>Ticket conversation</span>
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={conversation.load}
          disabled={conversation.loading}
        >
          {conversation.loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {conversation.error && <p className="alert alert--error">{conversation.error}</p>}
      {conversation.notice && <p className="alert alert--warning">{conversation.notice}</p>}
      <MessageList messages={conversation.messages} />
    </div>
  )
}

function MessageList({ messages }) {
  if (messages.length === 0) return <p className="legal-run__muted">The ticket has no public messages yet.</p>

  return (
    <ol className="ticket-conversation__messages">
      {messages.map(message => (
        <li
          key={message.id}
          className={`ticket-conversation__message ticket-conversation__message--${message.fromCustomer ? 'customer' : 'agent'}`}
        >
          <span className="legal-run__muted">
            {authorOf(message)} · {formatTime(message.at)}
          </span>
          <p className="ticket-conversation__text">{message.text}</p>
        </li>
      ))}
    </ol>
  )
}
