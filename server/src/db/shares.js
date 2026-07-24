import crypto from 'node:crypto'
import { and, eq, gt, lte, max } from 'drizzle-orm'
import { getDb } from './index.js'
import { conversations, conversationMessages, shares } from './schema.js'
import { ownedWebConversation } from './conversations.js'

const TTL_MS = 24 * 60 * 60 * 1000

export async function createOrRefreshShare(conversationId, userId) {
  const db = getDb()

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(ownedWebConversation(conversationId, userId))
    .limit(1)
  if (!conversation) return { status: 'not_found' }

  const [{ cutoff }] = await db
    .select({ cutoff: max(conversationMessages.id) })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
  if (cutoff == null) return { status: 'empty' }

  const expiresAt = new Date(Date.now() + TTL_MS)
  const [share] = await db
    .insert(shares)
    .values({ id: crypto.randomBytes(16).toString('hex'), conversationId, messageCutoffId: cutoff, expiresAt })
    .onConflictDoUpdate({ target: shares.conversationId, set: { messageCutoffId: cutoff, expiresAt } })
    .returning({ id: shares.id })
  return { status: 'ok', shareId: share.id }
}

export async function getShare(shareId) {
  const db = getDb()

  const [share] = await db
    .select({ conversationId: shares.conversationId, messageCutoffId: shares.messageCutoffId })
    .from(shares)
    .where(and(eq(shares.id, shareId), gt(shares.expiresAt, new Date())))
    .limit(1)
  if (!share) return null

  const rows = await db
    .select({ role: conversationMessages.role, parts: conversationMessages.parts })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, share.conversationId),
        lte(conversationMessages.id, share.messageCutoffId)
      )
    )
    .orderBy(conversationMessages.createdAt, conversationMessages.id)

  return { messages: rows.map(toRenderMessage) }
}

function toRenderMessage({ role, parts }) {
  if (role === 'user') {
    const content = (parts || [])
      .filter(part => part.type === 'text')
      .map(part => part.content)
      .join('')
    return { role, content }
  }
  return { role, parts: parts || [] }
}
