import './ConversationsPanel.css'

export default function ConversationsPanel({ children }) {
  return (
    <div className="lp-conversations-panel">
      <span className="lp-conversations-panel__label">Conversations</span>
      {children}
    </div>
  )
}
