import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
  inArray: (col, val) => ({ op: 'inArray', col, val }),
}))

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const record = name => value => {
    call.steps[name] = value
    return chain
  }
  const chain = {
    from: record('from'),
    where: record('where'),
    groupBy: record('groupBy'),
    values: record('values'),
    then: (resolve, reject) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }
  return chain
}

const db = { select: () => makeChain('select'), insert: () => makeChain('insert') }
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
  it('groups the shadow evaluations of the given repos', async () => {
    const rows = [{ repo: 'acme/web', evaluated: 3, wouldApprove: 1, since: new Date() }]
    queue.push(rows)

    expect(await getShadowStats(['acme/web'])).toEqual(rows)
    expect(calls[0].steps.where).toEqual({
      op: 'and',
      preds: [
        { op: 'eq', col: autoApproveEvaluations.mode, val: 'shadow' },
        { op: 'inArray', col: autoApproveEvaluations.repo, val: ['acme/web'] },
      ],
    })
    expect(calls[0].steps.groupBy).toBe(autoApproveEvaluations.repo)
  })
})
