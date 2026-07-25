import AssistantMessage from './AssistantMessage/AssistantMessage.jsx'
import UserMessage from './UserMessage/UserMessage.jsx'
import './Message.css'

export default function Message({ message, isStreaming, token }) {
  if (message.role === 'user') return <UserMessage message={message} token={token} />

  return <AssistantMessage message={message} isStreaming={isStreaming} token={token} />
}
