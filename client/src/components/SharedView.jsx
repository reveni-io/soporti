import { useState, useEffect } from 'react'
import Message from './Message.jsx'
import './SharedView.css'

export default function SharedView({ shareId }) {
  const [share, setShare] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/share/${shareId}`)
      .then(res => {
        if (!res.ok) throw new Error('not_found')
        return res.json()
      })
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
