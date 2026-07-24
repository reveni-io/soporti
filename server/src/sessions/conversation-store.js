import { randomUUID } from 'node:crypto'
import { eq, and, desc, gte, lt, sql } from 'drizzle-orm'
import { OpenAIResponsesCompactionSession } from '@openai/agents'
import { getDb } from '../db/index.js'
import { conversations, conversationMessages } from '../db/schema.js'
import { PostgresSession } from './postgres-session.js'
import { getOpenAIClient } from '../openai/client.js'

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const TITLE_MAX_LENGTH = 120

export class ConversationStore {
  constructor(db = getDb()) {
    this.db = db
    this._cleanupInterval = setInterval(() => {
      this.cleanupExpired().catch(err => console.error('[conversations] cleanup failed:', err.message))
    }, CLEANUP_INTERVAL_MS)
    this._cleanupInterval.unref()
  }

  async buildSession(conversationId) {
    const client = await getOpenAIClient()
    return new OpenAIResponsesCompactionSession({
      underlyingSession: new PostgresSession(conversationId, this.db),
      ...(client ? { client } : {}),
    })
  }

  async resolveWeb(sessionId, userId) {
    let conversationId = sessionId

    if (conversationId) {
      const [existing] = await this.db
        .select({
          id: conversations.id,
          userId: conversations.userId,
          lastResponseId: conversations.openaiLastResponseId,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)

      if (existing) {
        if (existing.userId !== null && existing.userId !== userId) {
          conversationId = randomUUID()
        } else {
          return {
            conversationId,
            session: await this.buildSession(conversationId),
            previousResponseId: existing.lastResponseId ?? undefined,
          }
        }
      }
    } else {
      conversationId = randomUUID()
    }

    await this.db
      .insert(conversations)
      .values({ id: conversationId, source: 'web', userId: userId ?? null })
      .onConflictDoNothing({ target: conversations.id })

    return { conversationId, session: await this.buildSession(conversationId), previousResponseId: undefined }
  }

  async resolveSlack(channelId, threadTs, userId) {
    const existing = await this._findSlack(channelId, threadTs)
    if (existing) {
      return {
        conversationId: existing.id,
        session: await this.buildSession(existing.id),
        previousResponseId: existing.lastResponseId ?? undefined,
      }
    }

    await this.db
      .insert(conversations)
      .values({
        id: randomUUID(),
        source: 'slack',
        userId: userId ?? null,
        slackChannelId: channelId,
        slackThreadTs: threadTs,
      })
      .onConflictDoNothing({ target: [conversations.slackChannelId, conversations.slackThreadTs] })

    const row = await this._findSlack(channelId, threadTs)
    const conversationId = row.id
    return {
      conversationId,
      session: await this.buildSession(conversationId),
      previousResponseId: row.lastResponseId ?? undefined,
    }
  }

  async _findSlack(channelId, threadTs) {
    const [row] = await this.db
      .select({ id: conversations.id, lastResponseId: conversations.openaiLastResponseId })
      .from(conversations)
      .where(and(eq(conversations.slackChannelId, channelId), eq(conversations.slackThreadTs, threadTs)))
      .limit(1)
    return row ?? null
  }

  async saveTurn(conversationId, { lastResponseId, uiMessages = [] } = {}) {
    const set = { updatedAt: new Date() }
    if (lastResponseId !== undefined) set.openaiLastResponseId = lastResponseId ?? null

    const firstUser = uiMessages.find(m => m.role === 'user')
    if (firstUser) {
      const title = deriveTitle(firstUser)
      if (title) set.title = sql`coalesce(${conversations.title}, ${title})`
    }

    await this.db.update(conversations).set(set).where(eq(conversations.id, conversationId))

    if (uiMessages.length > 0) {
      await this.db.insert(conversationMessages).values(
        uiMessages.map(m => ({
          conversationId,
          role: m.role,
          parts: m.parts ?? [],
        }))
      )
    }
  }

  async listWeb(userId) {
    const cutoff = new Date(Date.now() - RETENTION_MS)
    return this.db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(
        and(eq(conversations.userId, userId), eq(conversations.source, 'web'), gte(conversations.updatedAt, cutoff))
      )
      .orderBy(desc(conversations.updatedAt))
  }

  async getWebMessages(conversationId, userId) {
    const [conversation] = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.userId, userId), eq(conversations.source, 'web'))
      )
      .limit(1)

    if (!conversation) return null

    const rows = await this.db
      .select({ role: conversationMessages.role, parts: conversationMessages.parts })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(conversationMessages.createdAt, conversationMessages.id)

    return rows
  }

  async deleteWeb(conversationId, userId) {
    const deleted = await this.db
      .delete(conversations)
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.userId, userId), eq(conversations.source, 'web'))
      )
      .returning({ id: conversations.id })
    return deleted.length > 0
  }

  async cleanupExpired() {
    const cutoff = new Date(Date.now() - RETENTION_MS)
    const deleted = await this.db
      .delete(conversations)
      .where(lt(conversations.updatedAt, cutoff))
      .returning({ id: conversations.id })
    if (deleted.length > 0) {
      console.log(`[conversations] cleanup: removed ${deleted.length} expired`)
    }
    return deleted.length
  }

  destroy() {
    clearInterval(this._cleanupInterval)
  }
}

function deriveTitle(message) {
  const text = (message.parts || [])
    .filter(p => p.type === 'text' && p.content)
    .map(p => p.content)
    .join(' ')
    .trim()
  if (!text) return null
  return text.slice(0, TITLE_MAX_LENGTH)
}
