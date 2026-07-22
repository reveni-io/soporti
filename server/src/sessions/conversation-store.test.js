import { describe, it, expect, beforeEach, vi } from 'vitest'

// Structured query helpers the fake db can interpret.
vi.mock('drizzle-orm', () => ({
  eq: (col, val) => ({ op: 'eq', col, val }),
  and: (...preds) => ({ op: 'and', preds }),
  desc: col => ({ dir: 'desc', col }),
  gte: (col, val) => ({ op: 'gte', col, val }),
  lt: (col, val) => ({ op: 'lt', col, val }),
  sql: (strings, ...values) => ({ __sql: true, values }),
}))

vi.mock('@openai/agents', () => ({
  OpenAIResponsesCompactionSession: class {
    constructor(opts) {
      this.underlyingSession = opts.underlyingSession
    }
  },
}))

vi.mock('./postgres-session.js', () => ({
  PostgresSession: class {
    constructor(conversationId) {
      this.conversationId = conversationId
    }
  },
}))

vi.mock('../db/index.js', () => ({ getDb: vi.fn(() => null) }))

vi.mock('../openai/client.js', () => ({ getOpenAIClient: vi.fn(async () => ({})) }))

import { conversations, conversationMessages } from '../db/schema.js'
import { ConversationStore } from './conversation-store.js'

const COL_FIELD = new Map([
  [conversations.id, 'id'],
  [conversations.source, 'source'],
  [conversations.userId, 'userId'],
  [conversations.slackChannelId, 'slackChannelId'],
  [conversations.slackThreadTs, 'slackThreadTs'],
  [conversations.openaiLastResponseId, 'openaiLastResponseId'],
  [conversations.title, 'title'],
  [conversations.createdAt, 'createdAt'],
  [conversations.updatedAt, 'updatedAt'],
  [conversationMessages.id, 'id'],
  [conversationMessages.conversationId, 'conversationId'],
  [conversationMessages.role, 'role'],
  [conversationMessages.parts, 'parts'],
  [conversationMessages.createdAt, 'createdAt'],
])

function field(col) {
  return COL_FIELD.get(col)
}

function match(row, pred) {
  if (!pred) return true
  if (pred.op === 'and') return pred.preds.every(p => match(row, p))
  const v = row[field(pred.col)]
  if (pred.op === 'eq') return v === pred.val
  if (pred.op === 'gte') return v >= pred.val
  if (pred.op === 'lt') return v < pred.val
  return true
}

function project(row, projection) {
  const out = {}
  for (const [alias, col] of Object.entries(projection)) {
    out[alias] = row[field(col)]
  }
  return out
}

// In-memory drizzle-shaped fake covering the query shapes ConversationStore uses.
function makeFakeDb() {
  const tables = new Map([
    [conversations, []],
    [conversationMessages, []],
  ])
  let nextId = 1

  function rowsFor(table) {
    return tables.get(table)
  }

  function makeSelect(projection) {
    const state = {}
    const q = {
      from: t => {
        state.table = t
        return q
      },
      where: p => {
        state.pred = p
        return q
      },
      orderBy: (...cols) => {
        state.order = cols
        return q
      },
      limit: n => {
        state.limit = n
        return q
      },
      then: (resolve, reject) => {
        let result = rowsFor(state.table).filter(r => match(r, state.pred))
        if (state.order && state.order.length) {
          const first = state.order[0]
          if (first.dir === 'desc') {
            result = [...result].sort((a, b) => b[field(first.col)] - a[field(first.col)])
          } else {
            result = [...result].sort((a, b) => {
              const fa = field(first.col)
              return a[fa] > b[fa] ? 1 : a[fa] < b[fa] ? -1 : 0
            })
          }
        }
        if (state.limit != null) result = result.slice(0, state.limit)
        return Promise.resolve(result.map(r => project(r, projection))).then(resolve, reject)
      },
    }
    return q
  }

  return {
    _tables: tables,
    select: projection => makeSelect(projection),
    insert: table => ({
      values: vals => {
        const arr = Array.isArray(vals) ? vals : [vals]
        const insertAll = conflictTarget => {
          for (const v of arr) {
            if (conflictTarget) {
              const cols = Array.isArray(conflictTarget) ? conflictTarget : [conflictTarget]
              const fields = cols.map(c => field(c))
              const conflict = rowsFor(table).some(r => fields.every(f => r[f] === v[f]))
              if (conflict) continue
            }
            rowsFor(table).push({
              id: v.id ?? nextId++,
              createdAt: new Date(),
              updatedAt: new Date(),
              title: null,
              openaiLastResponseId: null,
              slackChannelId: null,
              slackThreadTs: null,
              userId: null,
              ...v,
            })
          }
        }
        return {
          onConflictDoNothing: opts => {
            insertAll(opts?.target ?? null)
            return Promise.resolve()
          },
          then: (resolve, reject) => {
            insertAll(null)
            return Promise.resolve().then(resolve, reject)
          },
        }
      },
    }),
    update: table => ({
      set: changes => ({
        where: pred => {
          for (const row of rowsFor(table)) {
            if (!match(row, pred)) continue
            for (const [k, val] of Object.entries(changes)) {
              if (val && val.__sql) {
                // coalesce(existing, literal)
                row[k] = row[k] != null ? row[k] : val.values[1]
              } else {
                row[k] = val
              }
            }
          }
          return Promise.resolve()
        },
      }),
    }),
    delete: table => ({
      where: pred => ({
        returning: projection => {
          const remaining = []
          const deleted = []
          for (const row of rowsFor(table)) {
            if (match(row, pred)) deleted.push(project(row, projection))
            else remaining.push(row)
          }
          tables.set(table, remaining)
          return Promise.resolve(deleted)
        },
      }),
    }),
  }
}

describe('ConversationStore', () => {
  let db
  let store

  beforeEach(() => {
    db = makeFakeDb()
    store = new ConversationStore(db)
  })

  it('resolveWeb creates a new conversation when no id is given', async () => {
    const { conversationId, session, previousResponseId } = await store.resolveWeb(null, 5)
    expect(conversationId).toBeTruthy()
    expect(session.underlyingSession.conversationId).toBe(conversationId)
    expect(previousResponseId).toBeUndefined()

    const [row] = db._tables.get(conversations)
    expect(row).toMatchObject({ id: conversationId, source: 'web', userId: 5 })
  })

  it('resolveWeb reuses an existing conversation and returns its previousResponseId', async () => {
    db._tables.get(conversations).push({
      id: 'sess-1',
      source: 'web',
      userId: 5,
      openaiLastResponseId: 'resp_42',
    })

    const result = await store.resolveWeb('sess-1', 5)
    expect(result.conversationId).toBe('sess-1')
    expect(result.previousResponseId).toBe('resp_42')
    expect(db._tables.get(conversations)).toHaveLength(1)
  })

  it('resolveWeb mints a new id when the id is owned by another user', async () => {
    db._tables.get(conversations).push({ id: 'sess-1', source: 'web', userId: 99 })

    const result = await store.resolveWeb('sess-1', 5)
    expect(result.conversationId).not.toBe('sess-1')
    expect(db._tables.get(conversations).find(c => c.id === result.conversationId).userId).toBe(5)
  })

  it('resolveWeb recreates a purged conversation with the same id', async () => {
    const result = await store.resolveWeb('11111111-1111-4111-8111-111111111111', 5)
    expect(result.conversationId).toBe('11111111-1111-4111-8111-111111111111')
    expect(result.previousResponseId).toBeUndefined()
    expect(db._tables.get(conversations)).toHaveLength(1)
  })

  it('resolveSlack creates and then reuses the conversation for a thread', async () => {
    const first = await store.resolveSlack('C1', '123.45', 7)
    expect(first.conversationId).toBeTruthy()
    expect(db._tables.get(conversations)).toHaveLength(1)

    db._tables.get(conversations)[0].openaiLastResponseId = 'resp_slack'

    const second = await store.resolveSlack('C1', '123.45', 7)
    expect(second.conversationId).toBe(first.conversationId)
    expect(second.previousResponseId).toBe('resp_slack')
    expect(db._tables.get(conversations)).toHaveLength(1)
  })

  it('resolveSlack does not duplicate the conversation when a concurrent insert wins the race', async () => {
    // A row for this thread appears between the initial select and our insert.
    db._tables.get(conversations).push({
      id: 'winner',
      source: 'slack',
      slackChannelId: 'C1',
      slackThreadTs: 't1',
      openaiLastResponseId: 'resp_w',
    })
    // Force the insert path: the first lookup misses, the conflicting insert is
    // a no-op, and the re-select returns the winning row.
    vi.spyOn(store, '_findSlack').mockResolvedValueOnce(null)

    const result = await store.resolveSlack('C1', 't1', 7)

    expect(result.conversationId).toBe('winner')
    expect(result.previousResponseId).toBe('resp_w')
    expect(db._tables.get(conversations)).toHaveLength(1)
  })

  it('saveTurn updates the response id, derives the title, and appends ui messages', async () => {
    db._tables.get(conversations).push({ id: 'c1', source: 'web', userId: 5, title: null })

    await store.saveTurn('c1', {
      lastResponseId: 'resp_new',
      uiMessages: [
        { role: 'user', parts: [{ type: 'text', content: 'How does auth work?' }] },
        { role: 'assistant', parts: [{ type: 'text', content: 'It uses JWT.' }] },
      ],
    })

    const conv = db._tables.get(conversations).find(c => c.id === 'c1')
    expect(conv.openaiLastResponseId).toBe('resp_new')
    expect(conv.title).toBe('How does auth work?')

    const msgs = db._tables.get(conversationMessages)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({ conversationId: 'c1', role: 'user' })
    expect(msgs[1]).toMatchObject({ conversationId: 'c1', role: 'assistant' })
  })

  it('saveTurn keeps an existing title (coalesce)', async () => {
    db._tables.get(conversations).push({ id: 'c1', source: 'web', userId: 5, title: 'Original title' })

    await store.saveTurn('c1', {
      uiMessages: [{ role: 'user', parts: [{ type: 'text', content: 'A different first message' }] }],
    })

    expect(db._tables.get(conversations)[0].title).toBe('Original title')
  })

  it('listWeb returns the user web conversations newest first', async () => {
    const now = Date.now()
    db._tables
      .get(conversations)
      .push(
        { id: 'a', source: 'web', userId: 5, title: 'A', updatedAt: new Date(now - 1000) },
        { id: 'b', source: 'web', userId: 5, title: 'B', updatedAt: new Date(now) },
        { id: 'c', source: 'web', userId: 9, title: 'C', updatedAt: new Date(now) },
        { id: 'd', source: 'slack', userId: 5, title: 'D', updatedAt: new Date(now) }
      )

    const list = await store.listWeb(5)
    expect(list.map(c => c.id)).toEqual(['b', 'a'])
  })

  it('listWeb excludes conversations older than 14 days', async () => {
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    db._tables.get(conversations).push({ id: 'old', source: 'web', userId: 5, title: 'old', updatedAt: old })

    const list = await store.listWeb(5)
    expect(list).toHaveLength(0)
  })

  it('getWebMessages returns null when the conversation is not owned by the user', async () => {
    db._tables.get(conversations).push({ id: 'c1', source: 'web', userId: 99 })
    expect(await store.getWebMessages('c1', 5)).toBeNull()
  })

  it('getWebMessages returns the messages for the owner', async () => {
    db._tables.get(conversations).push({ id: 'c1', source: 'web', userId: 5 })
    db._tables
      .get(conversationMessages)
      .push(
        { id: 1, conversationId: 'c1', role: 'user', parts: [{ type: 'text', content: 'hi' }], createdAt: new Date(1) },
        { id: 2, conversationId: 'c1', role: 'assistant', parts: [], createdAt: new Date(2) }
      )

    const msgs = await store.getWebMessages('c1', 5)
    expect(msgs).toEqual([
      { role: 'user', parts: [{ type: 'text', content: 'hi' }] },
      { role: 'assistant', parts: [] },
    ])
  })

  it('deleteWeb removes an owned conversation and reports it', async () => {
    db._tables.get(conversations).push({ id: 'c1', source: 'web', userId: 5 })
    expect(await store.deleteWeb('c1', 5)).toBe(true)
    expect(db._tables.get(conversations)).toHaveLength(0)

    expect(await store.deleteWeb('missing', 5)).toBe(false)
  })

  it('cleanupExpired deletes only conversations older than 14 days', async () => {
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    const fresh = new Date()
    db._tables
      .get(conversations)
      .push(
        { id: 'old', source: 'web', userId: 5, updatedAt: old },
        { id: 'fresh', source: 'web', userId: 5, updatedAt: fresh }
      )

    const removed = await store.cleanupExpired()
    expect(removed).toBe(1)
    expect(db._tables.get(conversations).map(c => c.id)).toEqual(['fresh'])
  })

  it('destroy clears the cleanup interval', () => {
    expect(() => store.destroy()).not.toThrow()
  })
})
