import { useEffect, useRef } from 'react'
import Message from '../../../common/Message/Message.jsx'
import VideoComposer from './VideoComposer/VideoComposer.jsx'
import { VIDEO_STAGES } from '../../../constants.js'
import { isComposing, isRendering } from '../version-state.js'
import './VideoConversation.css'

const COMPOSER_PLACEHOLDERS = {
  [VIDEO_STAGES.DRAFTING]: 'Soporti is drafting the storyboard…',
  [VIDEO_STAGES.STORYBOARD]: 'Ask for changes to the storyboard…',
  [VIDEO_STAGES.PRODUCTION]: 'Request a change…',
}

const COMPOSING_HINT = 'You can request a change once Soporti has composed this version.'
const RENDERING_HINT = 'Sending a change stops the current render and starts a new version.'
const OPEN_COMPOSER = { disabled: false, hint: null }

function composerState(video) {
  const latest = video.versions[0]

  if (video.stage === VIDEO_STAGES.DRAFTING) return { disabled: true, hint: null }
  if (video.stage !== VIDEO_STAGES.PRODUCTION || !latest) return OPEN_COMPOSER
  if (isComposing(latest)) return { disabled: true, hint: COMPOSING_HINT }
  if (isRendering(latest)) return { disabled: false, hint: RENDERING_HINT }

  return OPEN_COMPOSER
}

function toChatMessage(message) {
  if (message.role === 'user') return message

  return { role: 'assistant', parts: [{ type: 'text', content: message.content }] }
}

export default function VideoConversation({ video, token, busy, onSend, onRetry }) {
  const messagesRef = useRef(null)
  const isDrafting = video.stage === VIDEO_STAGES.DRAFTING
  const messageCount = video.messages.length
  const composer = composerState(video)

  useEffect(() => {
    const list = messagesRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messageCount])

  return (
    <section className="card video-conversation" aria-label="Conversation">
      <div className="video-conversation__messages" ref={messagesRef}>
        {video.messages.map(message => (
          <Message key={message.id} message={toChatMessage(message)} token={token} />
        ))}
      </div>

      {video.storyboardError && !isDrafting && (
        <div className="alert alert--error video-conversation__alert">
          <span>{video.storyboardError}</span>
          <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {composer.hint && <p className="video-conversation__hint">{composer.hint}</p>}

      <VideoComposer
        placeholder={COMPOSER_PLACEHOLDERS[video.stage]}
        disabled={composer.disabled}
        busy={busy}
        onSend={onSend}
      />
    </section>
  )
}
