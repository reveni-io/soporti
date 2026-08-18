import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'

let queue = []
let whereArgs = []
let db
let executed = []
let executedRows = []

function squash(text) {
  return text.replace(/\s+/g, ' ').trim()
}

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

const recordingDb = drizzle({
  client: {
    query: async (query, params) => {
      executed.push({ text: query?.text ?? query, params })
      return { rows: executedRows, fields: [] }
    },
  },
})

vi.mock('./index.js', () => ({ getDb: () => db }))

const { getUsageStats, getConversationStats, getMessageStats, getUserStats, USAGE_WINDOW_DAYS } =
  await import('./stats.js')

beforeEach(() => {
  queue = []
  whereArgs = []
  executed = []
  executedRows = []
  db = { select: () => makeChain() }
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

describe('getUserStats', () => {
  beforeEach(() => {
    db = recordingDb
  })

  it('ranks and cuts the users in a single round trip', async () => {
    await getUserStats(null, 20)

    expect(executed).toHaveLength(1)

    const [{ text, params }] = executed

    expect(squash(text)).toContain('order by coalesce(runs."inputTokens", 0) + coalesce(runs."outputTokens", 0) desc')
    expect(text).toContain('limit $')
    expect(params).toContain(20)
  })

  it('ranks every user that shows up in any of the three sources', async () => {
    await getUserStats(null)

    const [{ text }] = executed

    const squashed = squash(text)

    expect(squashed).toContain(
      'select "userKey" from runs union select "userKey" from convs union select "userKey" from msgs'
    )
    expect(squashed).toContain('left join runs on runs."userKey" = active."userKey"')
    expect(squashed).toContain('left join convs on convs."userKey" = active."userKey"')
    expect(squashed).toContain('left join msgs on msgs."userKey" = active."userKey"')
    expect(squashed).toContain('coalesce(runs."runs", 0) as "runs"')
  })

  it('leaves the runs nobody triggered out of the ranking', async () => {
    await getUserStats(null)

    expect(squash(executed[0].text).match(/"user_id" is not null/g)).toHaveLength(3)
  })

  it('takes the last activity from whichever of the runs and the messages is newer', async () => {
    await getUserStats(null)

    expect(squash(executed[0].text)).toContain('greatest(runs."lastRunAt", msgs."lastMessageAt") as "lastActiveAt"')
  })

  it('filters the runs, the conversations and the messages by the same range', async () => {
    const since = new Date('2026-08-01T00:00:00Z')

    await getUserStats(since)

    const [{ text, params }] = executed

    expect(text.match(/"created_at" >= \$\d+/g)).toHaveLength(3)
    expect(params.filter(param => param === since.toISOString())).toHaveLength(3)
  })

  it('turns the raw timestamp Postgres returns into a date the client can parse', async () => {
    executedRows = [{ userId: 1, runs: 1, lastActiveAt: '2026-08-13 11:00:00+00' }]

    const [row] = await getUserStats(null)

    expect(row.lastActiveAt).toEqual(new Date('2026-08-13T11:00:00.000Z'))
  })

  it('reads the counters back as numbers and leaves an unknown identity null', async () => {
    executedRows = [
      {
        userId: 7,
        name: null,
        email: null,
        conversations: 0,
        userMessages: 0,
        runs: 40,
        failedRuns: 2,
        requests: '90',
        inputTokens: '300000',
        outputTokens: '5000',
        cachedInputTokens: '200000',
        cacheWriteTokens: '100',
        lastActiveAt: null,
      },
    ]

    expect(await getUserStats(null)).toEqual([
      {
        userId: 7,
        name: null,
        email: null,
        conversations: 0,
        userMessages: 0,
        runs: 40,
        failedRuns: 2,
        requests: 90,
        inputTokens: 300_000,
        outputTokens: 5000,
        cachedInputTokens: 200_000,
        cacheWriteTokens: 100,
        lastActiveAt: null,
      },
    ])
  })
})
