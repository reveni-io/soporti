import { memo } from 'react'
import AssistantMessage from './AssistantMessage/AssistantMessage.jsx'
import UserMessage from './UserMessage/UserMessage.jsx'
import './Message.css'

export default memo(function Message({ message, isStreaming, token, onOpenArtifact }) {
  if (message.role === 'user') return <UserMessage message={message} token={token} />

  return <AssistantMessage message={message} isStreaming={isStreaming} token={token} onOpenArtifact={onOpenArtifact} />
})
