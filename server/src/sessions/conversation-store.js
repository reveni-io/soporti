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

// Replaces the in-memory SessionManager (web) and SlackSessionMapper (Slack).
// The database is the source of truth: every turn builds an ephemeral
// compaction session over a PostgresSession, so agent context survives restarts
// and the 30-minute TTL is gone. Conversations are purged 14 days after their
// last use (updated_at).
export class ConversationStore {
  constructor(db = getDb()) {
    this.db = db
    this._cleanupInterval = setInterval(() => {
      this.cleanupExpired().catch(err => console.error('[conversations] cleanup failed:', err.message))
    }, CLEANUP_INTERVAL_MS)
    this._cleanupInterval.unref()
  }

  // Wraps a PostgresSession in the compaction decorator, identical to what the
  // old SessionManager did with MemorySession. Compaction behaviour is unchanged.
  // The OpenAI client (built from the DB key) is passed explicitly because the
  // compaction session resolves it eagerly in its constructor; without it the
  // SDK falls back to the OPENAI_API_KEY env var (unset — the key lives in the
  // DB) and throws. Callers resolve the key up front, so a configured install
  // always has a client here; an unconfigured one lets the agent surface the
  // clean "configure it in /admin" error.
  async buildSession(conversationId) {
    const client = await getOpenAIClient()
    return new OpenAIResponsesCompactionSession({
      underlyingSession: new PostgresSession(conversationId, this.db),
      ...(client ? { client } : {}),
    })
  }

  // Web: the conversation id IS the client's sessionId (a UUID). If the row was
  // purged (>14 days) we recreate it with the same id and no items — a fresh
  // start. If the id is owned by another user we mint a new one instead.
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

  // Slack: keyed by (channel, thread). Survives restarts via the DB, replacing
  // the in-memory threadMap.
  async resolveSlack(channelId, threadTs, userId) {
    const existing = await this._findSlack(channelId, threadTs)
    if (existing) {
      return {
        conversationId: existing.id,
        session: await this.buildSession(existing.id),
        previousResponseId: existing.lastResponseId ?? undefined,
      }
    }

    // Two events from the same thread can both miss the select above and race
    // to insert. The conflict target is the (channel, thread) unique index, so
    // the loser is a no-op rather than an error; we then re-select to pick up
    // whichever row won.
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

  // Persists the result of a turn: refreshes the lastResponseId + updated_at
  // (keeping the conversation alive for retention), derives the web title from
  // the first user message, and appends any UI messages (web only — Slack keeps
  // its own message history).
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

  // Sidebar listing: the user's web conversations from the last 14 days.
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

  // Rehydrates a web conversation's messages, scoped to the owner. Returns null
  // when the conversation does not exist or is not owned by the user.
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

  // Deletes a web conversation owned by the user (cascade removes items and
  // messages). Returns true when a row was removed.
  async deleteWeb(conversationId, userId) {
    const deleted = await this.db
      .delete(conversations)
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.userId, userId), eq(conversations.source, 'web'))
      )
      .returning({ id: conversations.id })
    return deleted.length > 0
  }

  // Purges conversations unused for more than 14 days. The FK cascade removes
  // their items and messages.
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
