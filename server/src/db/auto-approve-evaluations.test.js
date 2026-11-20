import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
  inArray: (col, val) => ({ op: 'inArray', col, val }),
  desc: col => ({ op: 'desc', col }),
}))

let queue = []
let calls = []

const SUBQUERY = { repo: 'latest.repo', wouldApprove: 'latest.would_approve', firstAt: 'latest.first_at' }

function makeChain(op, on = null) {
  const call = { op, on, steps: {} }
  calls.push(call)
  const record =
    name =>
    (...values) => {
      call.steps[name] = values.length > 1 ? values : values[0]
      return chain
    }
  const chain = {
    from: record('from'),
    where: record('where'),
    groupBy: record('groupBy'),
    orderBy: record('orderBy'),
    values: record('values'),
    as: () => SUBQUERY,
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

const db = {
  select: () => makeChain('select'),
  selectDistinctOn: on => makeChain('selectDistinctOn', on),
  insert: () => makeChain('insert'),
}
vi.mock('./index.js', () => ({ getDb: () => db }))

const { autoApproveEvaluations } = await import('./schema.js')
const { getShadowStats, recordAutoApproveEvaluation } = await import('./auto-approve-evaluations.js')

beforeEach(() => {
  queue = []
  calls = []
})

describe('recordAutoApproveEvaluation', () => {
  it('stores the decision taken on a PR head', async () => {
    const evaluation = {
      repo: 'acme/web',
      prNumber: 12,
      headSha: 'abc',
      mode: 'shadow',
      wouldApprove: true,
      decidedBy: 'jev',
    }

    await recordAutoApproveEvaluation(evaluation)

    expect(calls[0].steps.values).toEqual(evaluation)
  })
})

describe('getShadowStats', () => {
  it('counts each PR of the given repos once, by its latest shadow evaluation', async () => {
    const rows = [{ repo: 'acme/web', evaluated: 3, wouldApprove: 1, since: new Date() }]
    queue.push(rows)

    expect(await getShadowStats(['acme/web'])).toEqual(rows)
    const [latest, stats] = calls
    expect(latest.on).toEqual([autoApproveEvaluations.repo, autoApproveEvaluations.prNumber])
    expect(latest.steps.where).toEqual({
      op: 'and',
      preds: [
        { op: 'eq', col: autoApproveEvaluations.mode, val: 'shadow' },
        { op: 'inArray', col: autoApproveEvaluations.repo, val: ['acme/web'] },
      ],
    })
    expect(latest.steps.orderBy).toEqual([
      autoApproveEvaluations.repo,
      autoApproveEvaluations.prNumber,
      { op: 'desc', col: autoApproveEvaluations.createdAt },
    ])
    expect(stats.steps.from).toBe(SUBQUERY)
    expect(stats.steps.groupBy).toBe(SUBQUERY.repo)
  })
})
