import { useState } from 'react'
import Icon from '../../../common/Icon/Icon.jsx'
import Message from '../../../common/Message/Message.jsx'
import TourModal from '../TourModal/TourModal.jsx'
import { useAuthedResource } from '../../../hooks/useAuthedResource/useAuthedResource.js'
import { getStats } from '../../../services/services.js'
import { useAttachments } from '../hooks/useAttachments/useAttachments.js'
import { useAutoScroll } from '../hooks/useAutoScroll/useAutoScroll.js'
import { useComposer } from '../hooks/useComposer/useComposer.js'
import { useMessageRail } from '../hooks/useMessageRail/useMessageRail.js'
import ChatComposer from './ChatComposer/ChatComposer.jsx'
import ChatEmptyState from './ChatEmptyState/ChatEmptyState.jsx'
import ChatTopbar from './ChatTopbar/ChatTopbar.jsx'
import MessageRail from './MessageRail/MessageRail.jsx'
import './ChatPanel.css'

const TOUR_SEEN_KEY = 'soportiTourSeen'

export default function ChatPanel({
  messages,
  isLoading,
  conversationKey,
  onSend,
  onStop,
  hasSourcesSelected,
  onOpenSidebar,
  onShare,
  onLogout,
  integrations = [],
  token,
  skills = [],
  initialQuestion = '',
  onOpenArtifact,
}) {
  const [tourOpen, setTourOpen] = useState(() => !localStorage.getItem(TOUR_SEEN_KEY))

  const stats = useAuthedResource(getStats, 'stats', token, null)
  const { scrollRef, contentRef, pinToBottom, isFollowing } = useAutoScroll(conversationKey)
  const rail = useMessageRail(scrollRef, contentRef, messages)
  const {
    attachments,
    error: attachmentError,
    isUploading,
    addFiles,
    removeAttachment,
    clearAttachments,
  } = useAttachments(token, onLogout, conversationKey)
  const { fill, ...composer } = useComposer({
    skills,
    isLoading,
    hasSourcesSelected,
    isUploading,
    onSend: handleSend,
    initialInput: initialQuestion,
  })

  function handleSend(text, invokedSkills) {
    pinToBottom()
    onSend(text, invokedSkills, attachments)
    clearAttachments()
  }

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

      <div className="chat__body">
        <div className="chat__messages" ref={scrollRef}>
          {messages.length === 0 && (
            <ChatEmptyState
              hasSourcesSelected={hasSourcesSelected}
              integrations={integrations}
              stats={stats}
              onTryExample={fill}
            />
          )}

          <div className="chat__messages-list" ref={contentRef}>
            {messages.map((message, index) => (
              <div key={index} className="chat__message" data-message-index={index}>
                <Message
                  message={message}
                  isStreaming={isLoading && index === messages.length - 1}
                  token={token}
                  onOpenArtifact={onOpenArtifact}
                />
              </div>
            ))}
          </div>
        </div>

        {rail.isOverflowing && (
          <MessageRail
            items={rail.items}
            progress={rail.progress}
            activeIndex={rail.activeIndex}
            onSelect={rail.scrollToMessage}
          />
        )}

        {!isFollowing && messages.length > 0 && (
          <button type="button" className="chat__jump" onClick={pinToBottom}>
            <Icon name="arrow-down" size={14} />
            Jump to latest
          </button>
        )}
      </div>

      <ChatComposer
        {...composer}
        isLoading={isLoading}
        hasSourcesSelected={hasSourcesSelected}
        onStop={onStop}
        attachments={attachments}
        attachmentError={attachmentError}
        isUploadingAttachment={isUploading}
        onAttachFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        token={token}
      />

      {tourOpen && <TourModal integrations={integrations} onClose={closeTour} onTryExample={handleTourExample} />}
    </div>
  )
}
