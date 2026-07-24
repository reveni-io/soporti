import { and, eq } from 'drizzle-orm'
import { conversations } from './schema.js'

export function ownedWebConversation(conversationId, userId) {
  return and(eq(conversations.id, conversationId), eq(conversations.userId, userId), eq(conversations.source, 'web'))
}
