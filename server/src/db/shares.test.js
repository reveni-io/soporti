import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []

function makeChain(op, arg) {
  const call = { op, arg, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    values: v => {
      call.steps.values = v
      return chain
    },
    returning: () => chain,
    onConflictDoUpdate: v => {
      call.steps.onConflict = v
      return chain
    },
    then: (resolve, reject) => {
      const next = queue.shift()
      const promise = next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? [])
      return promise.then(resolve, reject)
    },
  }
  return chain
}

vi.mock('./index.js', () => ({
  getDb: () => ({
    select: arg => makeChain('select', arg),
    insert: arg => makeChain('insert', arg),
  }),
}))

const { createOrRefreshShare, getShare } = await import('./shares.js')

const CONVERSATION_ID = 'a3bb189e-8bf9-4888-9912-ace4e6543002'

beforeEach(() => {
  queue = []
  calls = []
})

describe('createOrRefreshShare', () => {
  it('returns not_found when the conversation is not owned by the user', async () => {
    queue = [[]]

    const result = await createOrRefreshShare(CONVERSATION_ID, 1)

    expect(result).toEqual({ status: 'not_found' })
    expect(calls.filter(c => c.op === 'insert')).toHaveLength(0)
  })

  it('returns empty when the conversation has no persisted messages', async () => {
    queue = [[{ id: CONVERSATION_ID }], [{ cutoff: null }]]

    const result = await createOrRefreshShare(CONVERSATION_ID, 1)

    expect(result).toEqual({ status: 'empty' })
    expect(calls.filter(c => c.op === 'insert')).toHaveLength(0)
  })

  it('upserts a share frozen at the current message cutoff', async () => {
    queue = [[{ id: CONVERSATION_ID }], [{ cutoff: 42 }], [{ id: 'f'.repeat(32) }]]
    const before = Date.now()

    const result = await createOrRefreshShare(CONVERSATION_ID, 1)

    expect(result).toEqual({ status: 'ok', shareId: 'f'.repeat(32) })
    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values.id).toMatch(/^[0-9a-f]{32}$/)
    expect(insert.steps.values.conversationId).toBe(CONVERSATION_ID)
    expect(insert.steps.values.messageCutoffId).toBe(42)
    const expiresAt = insert.steps.values.expiresAt.getTime()
    expect(expiresAt).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000)
    expect(Object.keys(insert.steps.onConflict.set).sort()).toEqual(['expiresAt', 'messageCutoffId'])
  })
})

describe('getShare', () => {
  it('returns null when the share is missing or expired', async () => {
    queue = [[]]

    expect(await getShare('a'.repeat(32))).toBeNull()
  })

  it('returns the frozen transcript in render shape', async () => {
    const share = { conversationId: CONVERSATION_ID, messageCutoffId: 42 }
    const rows = [
      {
        role: 'user',
        parts: [
          { type: 'text', content: 'How do ' },
          { type: 'tool_call', tool: 'x' },
          { type: 'text', content: 'refunds work?' },
        ],
      },
      { role: 'assistant', parts: [{ type: 'text', content: 'Like this.' }] },
    ]
    queue = [[share], rows]

    const result = await getShare('a'.repeat(32))

    expect(result).toEqual({
      messages: [
        { role: 'user', content: 'How do refunds work?' },
        { role: 'assistant', parts: [{ type: 'text', content: 'Like this.' }] },
      ],
    })
  })

  it('exposes invoked skills on user messages as skill refs', async () => {
    const share = { conversationId: CONVERSATION_ID, messageCutoffId: 42 }
    const rows = [
      {
        role: 'user',
        parts: [
          { type: 'skill', skillId: 5, name: 'bug-triage' },
          { type: 'text', content: 'hi' },
        ],
      },
    ]
    queue = [[share], rows]

    const result = await getShare('a'.repeat(32))

    expect(result.messages).toEqual([{ role: 'user', content: 'hi', skills: [{ id: 5, name: 'bug-triage' }] }])
  })

  it('falls back to empty parts for messages stored without them', async () => {
    queue = [[{ conversationId: CONVERSATION_ID, messageCutoffId: 1 }], [{ role: 'assistant', parts: null }]]

    const result = await getShare('b'.repeat(32))

    expect(result.messages).toEqual([{ role: 'assistant', parts: [] }])
  })
})
