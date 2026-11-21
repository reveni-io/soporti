import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../common/Icon/Icon.jsx'
import Message from '../../common/Message/Message.jsx'
import { readStoredToken } from '../../context/AuthContext.jsx'
import { ROUTES } from '../../router/constants.js'
import { getSharedConversation } from '../../services/services.js'
import './SharedView.css'

const BACK_ICON_SIZE = 18

export default function SharedView({ shareId }) {
  const [share, setShare] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const isLoggedIn = Boolean(readStoredToken())

  useEffect(() => {
    getSharedConversation(shareId)
      .then(data => setShare(data))
      .catch(() => setError('not_found'))
      .finally(() => setLoading(false))
  }, [shareId])

  if (loading) {
    return (
      <div className="shared-view">
        <div className="shared-view__loading">Loading conversation...</div>
      </div>
    )
  }

  if (error || !share) {
    return (
      <div className="shared-view">
        <div className="shared-view__error">
          <h2>Conversation not found</h2>
          <p>This shared conversation may have expired or the link is invalid.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="shared-view">
      <header className="shared-view__header">
        {isLoggedIn && (
          <Link className="icon-btn shared-view__back" to={ROUTES.CHAT} aria-label="Back to chat">
            <Icon name="arrow-left" size={BACK_ICON_SIZE} />
          </Link>
        )}
        <span className="shared-view__brand">Soporti</span>
        <span className="shared-view__badge">Shared conversation</span>
      </header>

      <div className="shared-view__messages">
        {share.messages.map((msg, i) => (
          <Message key={i} message={msg} isStreaming={false} token={null} />
        ))}
      </div>

      <footer className="shared-view__footer">
        <p>This conversation is temporary. It may expire at any time.</p>
      </footer>
    </div>
  )
}
