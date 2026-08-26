import CopyButton from '../../CopyButton/CopyButton.jsx'
import FeedbackButtons from '../../FeedbackButtons/FeedbackButtons.jsx'
import AgentSteps from '../../AgentSteps/AgentSteps.jsx'
import ArtifactCard from '../../ArtifactCard/ArtifactCard.jsx'
import MarkdownContent from '../MarkdownContent/MarkdownContent.jsx'
import { groupParts } from './group-parts.js'

const PART_SEPARATOR = '\n\n'

export default function AssistantMessage({ message, isStreaming, token, onOpenArtifact }) {
  const groups = groupParts(message.parts)
  const answer = answerMarkdown(message.parts)
  const canCopy = !isStreaming && answer.length > 0
  const canRate = !isStreaming && Boolean(message.feedbackId)

  return (
    <div className="message message--assistant">
      <div className="message__bubble message__bubble--assistant">
        {groups.map((part, index) => (
          <MessagePart
            key={index}
            part={part}
            isStreaming={isStreaming}
            isActive={isStreaming && index === groups.length - 1}
            token={token}
            onOpenArtifact={onOpenArtifact}
          />
        ))}

        {message.parts.length === 0 && <TypingIndicator />}

        {(canCopy || canRate) && (
          <div className="message__actions">
            {canCopy && <CopyButton text={answer} ariaLabel="Copy answer" />}
            {canRate && <FeedbackButtons feedbackId={message.feedbackId} authToken={token} />}
          </div>
        )}
      </div>
    </div>
  )
}

function answerMarkdown(parts) {
  return parts
    .filter(part => part.type === 'text')
    .map(part => part.content)
    .join(PART_SEPARATOR)
}

function MessagePart({ part, isStreaming, isActive, token, onOpenArtifact }) {
  if (part.type === 'text') {
    return <MarkdownContent content={part.content} isStreaming={isStreaming} token={token} />
  }

  if (part.type === 'artifact') {
    return (
      <ArtifactCard artifactId={part.artifactId} title={part.title} version={part.version} onOpen={onOpenArtifact} />
    )
  }

  if (part.type === 'steps') {
    return <AgentSteps steps={part.steps} active={isActive} />
  }

  if (part.type === 'error') {
    return <div className="message__error">{part.content}</div>
  }

  return null
}

function TypingIndicator() {
  return (
    <div className="message__typing">
      <span></span>
      <span></span>
      <span></span>
    </div>
  )
}
