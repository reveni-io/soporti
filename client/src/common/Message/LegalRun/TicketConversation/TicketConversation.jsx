import { useState } from 'react'
import { formatTime } from '../format-time.js'
import { useSendReply } from '../hooks/useSendReply/useSendReply.js'
import { useTicketConversation } from '../hooks/useTicketConversation/useTicketConversation.js'
import SendConfirm from '../SendConfirm/SendConfirm.jsx'
import './TicketConversation.css'

function authorOf(message) {
  if (message.author) return message.author

  return message.fromCustomer ? 'Customer' : 'Agent'
}

export default function TicketConversation({ token, legalCase, label, send, needsCare, onSent, onLogout }) {
  const conversation = useTicketConversation(token, legalCase.id, onLogout)

  function handleSent(sent) {
    onSent(sent)
    conversation.load()
  }

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
      {send?.allowed && (
        <FollowUpReply
          token={token}
          legalCase={legalCase}
          label={label}
          needsCare={needsCare}
          onSent={handleSent}
          onLogout={onLogout}
        />
      )}
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

function FollowUpReply({ token, legalCase, label, needsCare, onSent, onLogout }) {
  const [reply, setReply] = useState('')
  const sender = useSendReply(token, legalCase.id, handleSent, onLogout)

  function handleSent(sent) {
    setReply('')
    onSent(sent)
  }

  function handleReplyChange(event) {
    setReply(event.target.value)
  }

  function handleSend(warningsRead) {
    sender.send(reply, warningsRead)
  }

  return (
    <div className="legal-run__email">
      <label className="legal-run__email">
        <span className="legal-run__email-meta">Reply on {label}</span>
        <textarea
          className="textarea"
          rows={4}
          value={reply}
          readOnly={sender.confirming || sender.sending}
          onChange={handleReplyChange}
        />
      </label>
      {sender.warning && <p className="alert alert--warning">{sender.warning}</p>}
      <ReplyAction
        sender={sender}
        recipient={legalCase.customer}
        label={label}
        needsCare={needsCare}
        canSend={Boolean(reply.trim())}
        onSend={handleSend}
      />
    </div>
  )
}

function ReplyAction({ sender, recipient, label, needsCare, canSend, onSend }) {
  if (sender.confirming) {
    return (
      <SendConfirm
        recipient={recipient}
        label={label}
        needsCare={needsCare}
        edited={false}
        sending={sender.sending}
        error={sender.error}
        onCancel={sender.cancel}
        onSend={onSend}
      />
    )
  }

  return (
    <div className="legal-run__actions">
      <button className="btn btn--secondary btn--sm" type="button" onClick={sender.start} disabled={!canSend}>
        Send
      </button>
    </div>
  )
}
