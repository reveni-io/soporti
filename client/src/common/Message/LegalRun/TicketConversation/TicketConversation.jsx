import { useState } from 'react'
import { formatTime } from '../format-time.js'
import { useSendReply } from '../hooks/useSendReply/useSendReply.js'
import { useTicketConversation } from '../hooks/useTicketConversation/useTicketConversation.js'
import SendConfirm from '../SendConfirm/SendConfirm.jsx'

function authorOf(message) {
  if (message.author) return message.author

  return message.fromCustomer ? 'Customer' : 'Agent'
}

export default function TicketConversation({ token, legalCase, label, send, needsCare, onSent }) {
  const conversation = useTicketConversation(token, legalCase.id)
  const sender = useSendReply(token, legalCase.id, handleSent)
  const [reply, setReply] = useState('')

  function handleSent(sent) {
    setReply('')
    onSent(sent)
    conversation.load()
  }

  function handleReplyChange(event) {
    setReply(event.target.value)
  }

  function handleSend(warningsRead) {
    sender.send(reply, warningsRead)
  }

  if (!conversation.messages) {
    return (
      <div className="legal-run__conversation">
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
    <div className="legal-run__conversation">
      <div className="legal-run__conversation-head">
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
      {conversation.messages.length === 0 ? (
        <p className="legal-run__muted">The ticket has no public messages yet.</p>
      ) : (
        <ol className="legal-run__messages">
          {conversation.messages.map(message => (
            <li
              key={message.id}
              className={`legal-run__message legal-run__message--${message.fromCustomer ? 'customer' : 'agent'}`}
            >
              <span className="legal-run__muted">
                {authorOf(message)} · {formatTime(message.at)}
              </span>
              <p className="legal-run__message-text">{message.text}</p>
            </li>
          ))}
        </ol>
      )}
      {send?.allowed && (
        <div className="legal-run__email">
          <label className="legal-run__email">
            <span className="legal-run__email-meta">Reply on {label}</span>
            <textarea className="textarea" rows={4} value={reply} onChange={handleReplyChange} />
          </label>
          {sender.confirming ? (
            <SendConfirm
              recipient={legalCase.customer}
              label={label}
              needsCare={needsCare}
              edited={false}
              sending={sender.sending}
              error={sender.error}
              onCancel={sender.cancel}
              onSend={handleSend}
            />
          ) : (
            <div className="legal-run__actions">
              <button
                className="btn btn--secondary btn--sm"
                type="button"
                onClick={sender.start}
                disabled={!reply.trim()}
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
