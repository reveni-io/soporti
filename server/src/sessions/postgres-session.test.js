import { describe, it, expect, beforeEach, vi } from 'vitest'

// Tag the query helpers so the fake db can interpret order direction, the
// single-row delete used by popItem, and the replayable-only SQL predicate.
// eq carries the targeted column + value.
vi.mock('drizzle-orm', () => ({
  eq: (col, val) => ({ kind: 'eq', col, val }),
  and: (...conds) => ({ kind: 'and', conds }),
  asc: col => ({ dir: 'asc', col }),
  desc: col => ({ dir: 'desc', col }),
  // The session's only raw SQL is the replayable-only predicate (excludes
  // reasoning rows); the fake db mirrors that semantic when it sees the tag.
  sql: (strings, ...values) => ({ kind: 'sql', strings, values }),
}))

vi.mock('../db/index.js', () => ({ getDb: vi.fn(() => null) }))

import { conversationItems } from '../db/schema.js'
import { PostgresSession } from './postgres-session.js'

function hasReplayableOnlyPredicate(pred) {
  if (!pred) return false
  if (pred.kind === 'sql') return true
  if (pred.kind === 'and') return pred.conds.some(hasReplayableOnlyPredicate)
  return false
}

// Minimal drizzle-shaped fake backed by an in-memory array. All queries in
// PostgresSession are scoped to a single conversation, so WHERE clauses are
// treated as conversation-wide except the popItem delete keyed on id and the
// replayable-only SQL predicate, which is applied as the real query would
// (before ORDER BY/LIMIT).
function makeFakeDb() {
  let rows = []
  let nextId = 1

  function makeSelect() {
    const state = { limit: null, order: null, pred: null }
    const q = {
      from: () => q,
      where: pred => {
        state.pred = pred
        return q
      },
      orderBy: o => {
        state.order = o
        return q
      },
      limit: n => {
        state.limit = n
        return q
      },
      then: (resolve, reject) => {
        let result = [...rows]
        if (hasReplayableOnlyPredicate(state.pred)) {
          result = result.filter(r => r.item?.type !== 'reasoning')
        }
        result.sort((a, b) => (state.order?.dir === 'desc' ? b.seq - a.seq : a.seq - b.seq))
        if (state.limit != null) result = result.slice(0, state.limit)
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return q
  }

  return {
    _rows: () => rows,
    select: () => makeSelect(),
    insert: () => ({
      values: vals => {
        const arr = Array.isArray(vals) ? vals : [vals]
        arr.forEach(v => rows.push({ id: nextId++, ...v }))
        return Promise.resolve()
      },
    }),
    delete: () => ({
      where: pred => {
        if (pred?.col === conversationItems.id) {
          rows = rows.filter(r => r.id !== pred.val)
        } else {
          rows = []
        }
        return Promise.resolve()
      },
    }),
  }
}

describe('PostgresSession', () => {
  let db
  let session

  beforeEach(() => {
    db = makeFakeDb()
    session = new PostgresSession('conv-1', db)
  })

  it('getSessionId returns the conversation id', async () => {
    expect(await session.getSessionId()).toBe('conv-1')
  })

  it('addItems assigns increasing seq and getItems returns chronological order', async () => {
    await session.addItems([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ])
    await session.addItems([{ role: 'user', content: 'c' }])

    const items = await session.getItems()
    expect(items).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ])
    expect(db._rows().map(r => r.seq)).toEqual([1, 2, 3])
  })

  it('addItems is a no-op for empty input', async () => {
    await session.addItems([])
    expect(db._rows()).toHaveLength(0)
  })

  it('getItems with a limit returns the most recent items in chronological order', async () => {
    await session.addItems([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }])
    const items = await session.getItems(2)
    expect(items).toEqual([{ n: 3 }, { n: 4 }])
  })

  it('getItems drops reasoning items but keeps messages and tool items', async () => {
    await session.addItems([
      { type: 'message', role: 'user', content: 'a' },
      { type: 'reasoning', id: 'rs_1', content: 'thinking' },
      { type: 'function_call', call_id: 'c1', name: 'search', arguments: '{}' },
      { type: 'function_call_output', call_id: 'c1', output: 'result' },
      { type: 'message', role: 'assistant', content: 'b' },
    ])

    const items = await session.getItems()
    expect(items).toEqual([
      { type: 'message', role: 'user', content: 'a' },
      { type: 'function_call', call_id: 'c1', name: 'search', arguments: '{}' },
      { type: 'function_call_output', call_id: 'c1', output: 'result' },
      { type: 'message', role: 'assistant', content: 'b' },
    ])
    // Still stored — only the read path filters them.
    expect(db._rows()).toHaveLength(5)
  })

  it('getItems(limit) excludes reasoning rows before applying the limit', async () => {
    await session.addItems([
      { type: 'message', role: 'user', content: 'a' },
      { type: 'reasoning', id: 'rs_1', content: 'thinking' },
      { type: 'message', role: 'assistant', content: 'b' },
    ])
    // The most recent 2 REPLAYABLE items — the reasoning row must not consume
    // a limit slot.
    const items = await session.getItems(2)
    expect(items).toEqual([
      { type: 'message', role: 'user', content: 'a' },
      { type: 'message', role: 'assistant', content: 'b' },
    ])
  })

  it('getItems strips stale provider ids from assistant messages', async () => {
    await session.addItems([
      { type: 'message', role: 'assistant', id: 'msg_1', providerData: { foo: 'bar' }, content: 'hi' },
    ])
    const items = await session.getItems()
    expect(items).toEqual([{ type: 'message', role: 'assistant', content: 'hi' }])
    // Stored untouched — only the read path strips.
    expect(db._rows()[0].item).toEqual({
      type: 'message',
      role: 'assistant',
      id: 'msg_1',
      providerData: { foo: 'bar' },
      content: 'hi',
    })
  })

  it('getItems strips ids from function_call items (compaction writes bypass SDK normalization)', async () => {
    await session.addItems([{ type: 'function_call', id: 'fc_1', call_id: 'c1', name: 'search', arguments: '{}' }])
    const items = await session.getItems()
    expect(items).toEqual([{ type: 'function_call', call_id: 'c1', name: 'search', arguments: '{}' }])
  })

  it('getItems leaves user messages and items without provider ids untouched', async () => {
    await session.addItems([
      { type: 'message', role: 'user', content: 'a' },
      { type: 'message', role: 'assistant', content: 'no id' },
      { type: 'function_call_output', call_id: 'c1', output: 'result' },
    ])
    const items = await session.getItems()
    expect(items).toEqual([
      { type: 'message', role: 'user', content: 'a' },
      { type: 'message', role: 'assistant', content: 'no id' },
      { type: 'function_call_output', call_id: 'c1', output: 'result' },
    ])
  })

  it('popItem removes and returns the most recent item', async () => {
    await session.addItems([{ n: 1 }, { n: 2 }])
    const popped = await session.popItem()
    expect(popped).toEqual({ n: 2 })
    expect(await session.getItems()).toEqual([{ n: 1 }])
  })

  it('popItem returns undefined on an empty session', async () => {
    expect(await session.popItem()).toBeUndefined()
  })

  it('clearSession removes all items', async () => {
    await session.addItems([{ n: 1 }, { n: 2 }])
    await session.clearSession()
    expect(await session.getItems()).toEqual([])
  })
})
