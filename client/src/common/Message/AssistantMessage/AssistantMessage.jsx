import { memo } from 'react'
import FeedbackButtons from '../../FeedbackButtons/FeedbackButtons.jsx'
import ToolCall from '../../ToolCall/ToolCall.jsx'
import MarkdownContent from '../MarkdownContent/MarkdownContent.jsx'

export default function AssistantMessage({ message, isStreaming, token }) {
  return (
    <div className="message message--assistant">
      <div className="message__bubble message__bubble--assistant">
        {message.parts.map((part, index) => (
          <MessagePart key={index} part={part} isStreaming={isStreaming} token={token} />
        ))}

        {message.parts.length === 0 && <TypingIndicator />}

        {!isStreaming && message.feedbackId && <FeedbackButtons feedbackId={message.feedbackId} authToken={token} />}
      </div>
    </div>
  )
}

const MessagePart = memo(function MessagePart({ part, isStreaming, token }) {
  if (part.type === 'text') {
    return <MarkdownContent content={part.content} isStreaming={isStreaming} token={token} />
  }

  if (part.type === 'tool_call') {
    return <ToolCall tool={part.tool} input={part.input} done={part.done} durationMs={part.durationMs} />
  }

  if (part.type === 'error') {
    return <div className="message__error">{part.content}</div>
  }

  return null
})

function TypingIndicator() {
  return (
    <div className="message__typing">
      <span></span>
      <span></span>
      <span></span>
    </div>
  )
}
