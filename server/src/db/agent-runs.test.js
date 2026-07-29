import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'

let queue = []
let calls = []
let db

const executed = []

const recordingDb = drizzle({
  client: {
    query: async (query, params) => {
      executed.push({ text: query?.text ?? query, params })
      return { rows: [], fields: [] }
    },
  },
})

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    limit: v => {
      call.steps.limit = v
      return chain
    },
    values: v => {
      call.steps.values = v
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

const stubDb = {
  select: () => makeChain('select'),
  insert: () => makeChain('insert'),
}

vi.mock('./index.js', () => ({ getDb: () => db }))

const { recordAgentRun, getRunTotals, getRunsByChannel, countDistinctSubjects, getTopTools } =
  await import('./agent-runs.js')

beforeEach(() => {
  queue = []
  calls = []
  db = stubDb
  executed.length = 0
  vi.restoreAllMocks()
})

describe('recordAgentRun', () => {
  it('inserts the usage counters the run reported', async () => {
    await recordAgentRun({
      channel: 'web',
      status: 'ok',
      usage: { requests: 3, inputTokens: 1000, outputTokens: 200, cachedInputTokens: 800, cacheWriteTokens: 50 },
      durationMs: 1234.6,
      tools: ['search_code'],
    })

    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toEqual({
      channel: 'web',
      status: 'ok',
      subject: null,
      requests: 3,
      inputTokens: 1000,
      outputTokens: 200,
      cachedInputTokens: 800,
      cacheWriteTokens: 50,
      durationMs: 1235,
      tools: ['search_code'],
    })
  })

  it('records zeroed counters for a failed run that never reported usage', async () => {
    await recordAgentRun({ channel: 'pr_review', status: 'error', subject: 'org/repo#7' })

    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toMatchObject({
      channel: 'pr_review',
      status: 'error',
      subject: 'org/repo#7',
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      durationMs: 0,
      tools: [],
    })
  })

  it('swallows a DB failure so recording stats never breaks the answer', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    queue = [new Error('db down')]

    await expect(recordAgentRun({ channel: 'web', status: 'ok' })).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalledWith('Failed to record the agent run:', expect.any(Error))
  })
})

describe('getRunTotals', () => {
  it('returns the aggregated row with the token sums as numbers', async () => {
    queue = [
      [
        {
          runs: 4,
          failedRuns: 1,
          requests: '12',
          inputTokens: '51010',
          outputTokens: '2320',
          cachedInputTokens: '40800',
          cacheWriteTokens: '50',
          p50DurationMs: 3000,
          p95DurationMs: 8400,
        },
      ],
    ]

    expect(await getRunTotals(new Date())).toEqual({
      runs: 4,
      failedRuns: 1,
      requests: 12,
      inputTokens: 51010,
      outputTokens: 2320,
      cachedInputTokens: 40800,
      cacheWriteTokens: 50,
      p50DurationMs: 3000,
      p95DurationMs: 8400,
    })
  })

  it('returns zeros when there are no runs yet', async () => {
    queue = [[]]

    expect(await getRunTotals(null)).toEqual({
      runs: 0,
      failedRuns: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      p50DurationMs: 0,
      p95DurationMs: 0,
    })
  })
})

describe('getRunsByChannel', () => {
  it('keeps the channel alongside its aggregates', async () => {
    queue = [[{ channel: 'web', runs: 2, failedRuns: 1, inputTokens: '1000' }]]

    const rows = await getRunsByChannel(null)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ channel: 'web', runs: 2, failedRuns: 1, inputTokens: 1000, outputTokens: 0 })
  })
})

describe('countDistinctSubjects', () => {
  it('returns the distinct subject count of the channel', async () => {
    queue = [[{ total: 7 }]]
    expect(await countDistinctSubjects('pr_review', null)).toBe(7)
  })

  it('returns zero when the channel has not run yet', async () => {
    queue = [[]]
    expect(await countDistinctSubjects('pr_review', null)).toBe(0)
  })
})

describe('getTopTools', () => {
  it('returns the tool ranking and applies the limit', async () => {
    queue = [
      [
        { tool: 'get_file_contents', calls: 12 },
        { tool: 'search_code', calls: 5 },
      ],
    ]

    const tools = await getTopTools(null, 3)

    expect(tools).toEqual([
      { tool: 'get_file_contents', calls: 12 },
      { tool: 'search_code', calls: 5 },
    ])
    expect(calls.find(c => c.op === 'select').steps.limit).toBe(3)
  })

  it('falls back to the default limit when the caller gives none', async () => {
    queue = [[]]

    expect(await getTopTools(null)).toEqual([])
    expect(calls.find(c => c.op === 'select').steps.limit).toBe(10)
  })
})

describe('the statements Postgres receives', () => {
  beforeEach(() => {
    db = recordingDb
  })

  it('casts the quantile so percentile_cont resolves to its scalar overload', async () => {
    await getRunTotals(null)

    expect(executed).toHaveLength(1)
    expect(executed[0].text).toMatch(/percentile_cont\(\$\d+::double precision\) within group \(order by/)
    expect(executed[0].params).toContain(0.5)
    expect(executed[0].params).toContain(0.95)
  })

  it('filters by created_at only when a range was given', async () => {
    const since = new Date('2026-01-01T00:00:00Z')

    await getRunsByChannel(since)
    await getRunsByChannel(null)

    expect(executed[0].text).toContain('"created_at" >=')
    expect(executed[0].params).toContain(since.toISOString())
    expect(executed[0].text).toContain('group by "agent_runs"."channel"')
    expect(executed[1].text).not.toContain('"created_at"')
  })

  it('expands the recorded tool array to rank the tools', async () => {
    await getTopTools(null, 5)

    expect(executed[0].text).toContain('cross join lateral jsonb_array_elements_text("agent_runs"."tools") as tool')
    expect(executed[0].text).toContain('limit $1')
    expect(executed[0].params).toEqual([5])
  })

  it('counts the distinct subjects of one channel', async () => {
    await countDistinctSubjects('pr_review', null)

    expect(executed[0].text).toContain('count(distinct "subject")::int')
    expect(executed[0].params).toEqual(['pr_review', 'ok'])
  })

  it('inserts one row per run', async () => {
    await recordAgentRun({ channel: 'web', status: 'ok', durationMs: 12, tools: ['search_code'] })

    expect(executed).toHaveLength(1)
    expect(executed[0].text).toContain('insert into "agent_runs"')
    expect(executed[0].params).toEqual(['web', 'ok', null, 0, 0, 0, 0, 0, 12, '["search_code"]'])
  })
})
