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
import { useSharedContent } from '../hooks/useSharedContent/useSharedContent.js'
import ChatComposer from './ChatComposer/ChatComposer.jsx'
import ChatEmptyState from './ChatEmptyState/ChatEmptyState.jsx'
import ChatTopbar from './ChatTopbar/ChatTopbar.jsx'
import { conversationTitle } from './ChatTopbar/conversation-title.js'
import MessageRail from './MessageRail/MessageRail.jsx'
import './ChatPanel.css'

const TOUR_SEEN_KEY = 'soportiTourSeen'
const BOT_LOADING_TEXT = 'Loading the conversation…'

export default function ChatPanel({
  messages,
  isLoading,
  conversationKey,
  onSend,
  onStop,
  hasSourcesSelected,
  onOpenSidebar,
  isSidebarCollapsed = false,
  onExpandSidebar,
  onShare,
  onLogout,
  integrations = [],
  token,
  skills = [],
  initialQuestion = '',
  onOpenArtifact,
  bot = null,
  isFetching = false,
  fetchError = null,
  onOpenRoutines,
  onEditBot,
  onBackToBots,
  isShared = false,
  onSharedContentRead,
}) {
  const [tourOpen, setTourOpen] = useState(() => !localStorage.getItem(TOUR_SEEN_KEY))

  const stats = useAuthedResource(getStats, { key: 'stats', token, initialValue: null })
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
  const isEmpty = messages.length === 0
  const { fill, ...composer } = useComposer({
    skills,
    isLoading,
    hasSourcesSelected,
    isUploading,
    onSend: handleSend,
    initialInput: initialQuestion,
    conversationKey,
  })
  useSharedContent({ isShared, onShare: handleSharedContent, onRead: onSharedContentRead })

  function handleSend(text, invokedSkills) {
    pinToBottom()
    onSend(text, invokedSkills, attachments)
    clearAttachments()
  }

  function handleSharedContent({ text, files }) {
    fill(text)
    addFiles(files)
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
        title={conversationTitle(messages)}
        bot={bot}
        canShare={!isEmpty && Boolean(onShare)}
        isLoading={isLoading}
        isSidebarCollapsed={isSidebarCollapsed}
        onOpenSidebar={onOpenSidebar}
        onExpandSidebar={onExpandSidebar}
        onOpenTour={() => setTourOpen(true)}
        onShare={onShare}
        onOpenRoutines={onOpenRoutines}
        onEditBot={onEditBot}
        onBackToBots={onBackToBots}
      />

      <div className="chat__body">
        <div className="chat__messages" ref={scrollRef}>
          {isEmpty && bot && <BotTranscriptStatus isFetching={isFetching} error={fetchError} />}
          {isEmpty && !bot && (
            <ChatEmptyState
              hasSourcesSelected={hasSourcesSelected}
              integrations={integrations}
              stats={stats}
              onTryExample={fill}
            />
          )}

          <div className="chat__messages-list" ref={contentRef}>
            {messages.map((message, index) => (
              <div key={`${conversationKey}-${index}`} className="chat__message" data-message-index={index}>
                <Message
                  message={message}
                  isStreaming={isLoading && index === messages.length - 1}
                  token={token}
                  onOpenArtifact={onOpenArtifact}
                  onLogout={onLogout}
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

        {!isFollowing && !isEmpty && (
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

function BotTranscriptStatus({ isFetching, error }) {
  if (error) {
    return (
      <p className="alert alert--error chat__fetch-error" role="alert">
        {error}
      </p>
    )
  }
  if (isFetching) return <p className="chat__status">{BOT_LOADING_TEXT}</p>

  return null
}
