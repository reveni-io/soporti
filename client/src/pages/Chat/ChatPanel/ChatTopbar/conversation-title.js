const NEW_CHAT_TITLE = 'New chat'
const UNTITLED_TITLE = 'Untitled conversation'

export function conversationTitle(messages) {
  if (messages.length === 0) return NEW_CHAT_TITLE

  const firstQuestion = messages.find(message => message.role === 'user')?.content?.trim()

  return firstQuestion || UNTITLED_TITLE
}
