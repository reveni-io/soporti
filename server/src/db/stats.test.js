import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let whereArgs = []

function makeChain() {
  const chain = {
    from: () => chain,
    where: value => {
      whereArgs.push(value)
      return chain
    },
    groupBy: () => chain,
    orderBy: () => chain,
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

vi.mock('./index.js', () => ({ getDb: () => ({ select: () => makeChain() }) }))

const { getUsageStats, getConversationStats, getMessageStats, USAGE_WINDOW_DAYS } = await import('./stats.js')

beforeEach(() => {
  queue = []
  whereArgs = []
})

describe('getUsageStats', () => {
  it('returns the conversation and active user counts of the window', async () => {
    queue = [[{ conversations: 128, activeUsers: 9 }]]

    expect(await getUsageStats()).toEqual({ conversations: 128, activeUsers: 9 })
    expect(USAGE_WINDOW_DAYS).toBe(7)
  })

  it('returns zeros when the window is empty', async () => {
    queue = [[]]
    expect(await getUsageStats()).toEqual({ conversations: 0, activeUsers: 0 })
  })
})

describe('getConversationStats', () => {
  it('returns the totals plus the breakdown by source', async () => {
    queue = [
      [{ conversations: 30, activeUsers: 4 }],
      [
        { source: 'web', conversations: 20 },
        { source: 'slack', conversations: 10 },
      ],
    ]

    expect(await getConversationStats(new Date('2026-01-01'))).toEqual({
      conversations: 30,
      activeUsers: 4,
      bySource: [
        { source: 'web', conversations: 20 },
        { source: 'slack', conversations: 10 },
      ],
    })
  })

  it('filters by date when a start is given and not at all when it is null', async () => {
    queue = [[{ conversations: 1, activeUsers: 1 }], []]
    await getConversationStats(new Date('2026-01-01'))
    expect(whereArgs.every(arg => arg !== undefined)).toBe(true)

    whereArgs = []
    queue = [[{ conversations: 1, activeUsers: 1 }], []]
    await getConversationStats(null)
    expect(whereArgs).toEqual([undefined, undefined])
  })

  it('returns zeros and an empty breakdown when there is nothing yet', async () => {
    queue = [[], []]

    expect(await getConversationStats(null)).toEqual({ conversations: 0, activeUsers: 0, bySource: [] })
  })
})

describe('getMessageStats', () => {
  it('returns the message counts split by author', async () => {
    queue = [[{ messages: 18, userMessages: 9 }]]

    expect(await getMessageStats(null)).toEqual({ messages: 18, userMessages: 9 })
  })

  it('returns zeros when there are no messages', async () => {
    queue = [[]]
    expect(await getMessageStats(new Date())).toEqual({ messages: 0, userMessages: 0 })
  })
})
