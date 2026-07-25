import { useEffect, useRef, useState } from 'react'
import Message from '../../../common/Message/Message.jsx'
import TourModal from '../TourModal/TourModal.jsx'
import { useAuthedResource } from '../../../hooks/useAuthedResource/useAuthedResource.js'
import { getStats } from '../../../services/services.js'
import { useComposer } from '../hooks/useComposer/useComposer.js'
import ChatComposer from './ChatComposer/ChatComposer.jsx'
import ChatEmptyState from './ChatEmptyState/ChatEmptyState.jsx'
import ChatTopbar from './ChatTopbar/ChatTopbar.jsx'
import './ChatPanel.css'

const TOUR_SEEN_KEY = 'soportiTourSeen'

export default function ChatPanel({
  messages,
  isLoading,
  onSend,
  onStop,
  hasSourcesSelected,
  onOpenSidebar,
  onShare,
  integrations = [],
  token,
  skills = [],
}) {
  const [tourOpen, setTourOpen] = useState(() => !localStorage.getItem(TOUR_SEEN_KEY))
  const messagesEndRef = useRef(null)

  const stats = useAuthedResource(getStats, 'stats', token, null)
  const { fill, ...composer } = useComposer({ skills, isLoading, hasSourcesSelected, onSend })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function closeTour() {
    setTourOpen(false)
    localStorage.setItem(TOUR_SEEN_KEY, '1')
  }

  function handleTourExample(text) {
    closeTour()
    fill(text)
  }

  return (
    <div className="chat">
      <ChatTopbar
        canShare={messages.length > 0 && Boolean(onShare)}
        isLoading={isLoading}
        onOpenSidebar={onOpenSidebar}
        onOpenTour={() => setTourOpen(true)}
        onShare={onShare}
      />

      <div className="chat__messages">
        {messages.length === 0 && (
          <ChatEmptyState
            hasSourcesSelected={hasSourcesSelected}
            integrations={integrations}
            stats={stats}
            onTryExample={fill}
          />
        )}

        {messages.map((message, index) => (
          <Message
            key={index}
            message={message}
            isStreaming={isLoading && index === messages.length - 1}
            token={token}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      <ChatComposer {...composer} isLoading={isLoading} hasSourcesSelected={hasSourcesSelected} onStop={onStop} />

      {tourOpen && <TourModal integrations={integrations} onClose={closeTour} onTryExample={handleTourExample} />}
    </div>
  )
}
