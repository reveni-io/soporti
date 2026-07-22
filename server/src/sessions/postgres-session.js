import { eq, and, asc, desc, sql } from 'drizzle-orm'
import { getDb } from '../db/index.js'
import { conversationItems } from '../db/schema.js'

// Canonical rationale for why the read path sanitizes replayed history (the
// run() call sites in routes/chat.js and slack/handler.js point here):
//
// Reasoning items are only meaningful within the run that produced them —
// reasoning models (e.g. gpt-5.x-codex) require each reasoning item to stay
// paired with the function_call it produced, and replayed across turns they
// carry stale ids from an expired response. They are rebuilt fresh each turn,
// so nothing of value is lost by excluding them. The exclusion happens in SQL,
// before any LIMIT, so the limited read keeps its "most recent N items"
// contract and the dead rows never leave the database.
const REPLAYABLE_ONLY = sql`${conversationItems.item}->>'type' is distinct from 'reasoning'`

// Persisted items can carry provider ids from the response that produced them:
// the SDK strips ids from function_call/tool_search items at persistence, but
// assistant messages keep their msg_ id (and compaction output is written back
// without that normalization at all). Replaying such an id after its source
// response expired makes the API reject the request, so reads drop them — the
// same defense the SDK's own OpenAIConversationsSession applies to replayed
// assistant messages.
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

// Implements the OpenAI Agents SDK `Session` interface against the
// conversation_items table, so a conversation's agent context lives in
// PostgreSQL instead of memory. One instance is created per turn, bound to a
// conversationId. Items are ordered by a monotonically increasing `seq`.
//
// These rows are mutable: OpenAIResponsesCompactionSession wraps this session
// and may clearSession()/addItems() to replace history with a summary. The
// faithful, append-only record for the UI lives in conversation_messages.
export class PostgresSession {
  constructor(conversationId, db = getDb()) {
    this.conversationId = conversationId
    this.db = db
  }

  async getSessionId() {
    return this.conversationId
  }

  // Returns replayable items in chronological order. When `limit` is provided,
  // returns the most recent `limit` replayable items (still chronological).
  // Reasoning rows are excluded and stale provider ids stripped — see the
  // REPLAYABLE_ONLY / toReplayableItem comments above. addItems still stores
  // everything; only reads sanitize.
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
