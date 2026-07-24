import { eq, and, asc, desc, sql } from 'drizzle-orm'
import { getDb } from '../db/index.js'
import { conversationItems } from '../db/schema.js'

const REPLAYABLE_ONLY = sql`${conversationItems.item}->>'type' is distinct from 'reasoning'`

function toReplayableItem(item) {
  if (!item || typeof item !== 'object') return item
  if (item.type === 'message' && item.role === 'assistant' && ('id' in item || 'providerData' in item)) {
    const { id: _id, providerData: _providerData, ...rest } = item
    return rest
  }
  if (item.type === 'function_call' && 'id' in item) {
    const { id: _id, ...rest } = item
    return rest
  }
  return item
}

export class PostgresSession {
  constructor(conversationId, db = getDb()) {
    this.conversationId = conversationId
    this.db = db
  }

  async getSessionId() {
    return this.conversationId
  }

  async getItems(limit) {
    const replayable = and(eq(conversationItems.conversationId, this.conversationId), REPLAYABLE_ONLY)

    if (limit !== undefined && limit !== null) {
      const rows = await this.db
        .select({ item: conversationItems.item })
        .from(conversationItems)
        .where(replayable)
        .orderBy(desc(conversationItems.seq))
        .limit(limit)
      return rows.map(r => toReplayableItem(r.item)).reverse()
    }

    const rows = await this.db
      .select({ item: conversationItems.item })
      .from(conversationItems)
      .where(replayable)
      .orderBy(asc(conversationItems.seq))
    return rows.map(r => toReplayableItem(r.item))
  }

  async addItems(items) {
    if (!items || items.length === 0) return

    const [last] = await this.db
      .select({ seq: conversationItems.seq })
      .from(conversationItems)
      .where(eq(conversationItems.conversationId, this.conversationId))
      .orderBy(desc(conversationItems.seq))
      .limit(1)

    let seq = last ? last.seq : 0
    const rows = items.map(item => ({
      conversationId: this.conversationId,
      seq: ++seq,
      item,
    }))
    await this.db.insert(conversationItems).values(rows)
  }

  async popItem() {
    const [last] = await this.db
      .select({ id: conversationItems.id, item: conversationItems.item })
      .from(conversationItems)
      .where(eq(conversationItems.conversationId, this.conversationId))
      .orderBy(desc(conversationItems.seq))
      .limit(1)

    if (!last) return undefined

    await this.db.delete(conversationItems).where(eq(conversationItems.id, last.id))
    return last.item
  }

  async clearSession() {
    await this.db.delete(conversationItems).where(eq(conversationItems.conversationId, this.conversationId))
  }
}
