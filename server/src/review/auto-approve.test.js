import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJevDocument = vi.fn()
vi.mock('../db/jev-documents.js', () => ({ getJevDocument }))

const recordAutoApproveEvaluation = vi.fn()
vi.mock('../db/auto-approve-evaluations.js', () => ({ recordAutoApproveEvaluation }))

const runJevCheck = vi.fn()
vi.mock('../jev/check.js', () => ({ runJevCheck }))

const { decideAutoApprove, loadAutoApproveRepo } = await import('./auto-approve.js')

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
const RULES = [
  { id: 'ci', role: 'veto' },
  { id: 'nitpicks', role: 'veto', limit: 3 },
]

function context({ mode = 'on', jev = true, todayEvent = 'COMMENT' } = {}) {
  return {
    repo: { name: 'acme/web', mode, jev, denylist: ['src/payments/**'] },
    todayEvent,
    pullRequest: { repoFullName: 'acme/web', prNumber: 12, headSha: 'abc123', title: 'Fix totals', body: 'Desc' },
    review: {
      ciStatus: { checks: [], incomplete: false },
      findings: [],
      passes: [],
      notReviewed: [],
      overview: { reviewMinutes: 5 },
      history: { unresolvedThreads: 0 },
      fixedThreads: [],
      files: [
        { filename: 'src/payments/fees.js', patch: '+fee' },
        { filename: 'package-lock.json', patch: '+x', generated: true },
      ],
    },
  }
}

function row(questionId, answer, { flagged = false, unsure = false } = {}) {
  return { questionId, question: questionId, answer, confidence: 0.9, flagged, unsure }
}

function answered(rows) {
  runJevCheck.mockImplementation(async ({ buildExtraQuestions }) => {
    buildExtraQuestions({ rules: RULES })
    return { status: 'answered', setVersion: 9, model: 'jev-1.14.0', rows }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  recordAutoApproveEvaluation.mockResolvedValue()
})

describe('loadAutoApproveRepo', () => {
  it('finds the repo regardless of the case of its name', async () => {
    getJevDocument.mockResolvedValue({ data: { repos: [{ name: 'Acme/Web', mode: 'shadow' }] } })

    expect(await loadAutoApproveRepo('acme/web', { logger })).toEqual({ name: 'Acme/Web', mode: 'shadow' })
    expect(getJevDocument).toHaveBeenCalledWith('github')
  })

  it('treats a missing project or repo as not listed', async () => {
    getJevDocument.mockResolvedValue(null)

    expect(await loadAutoApproveRepo('acme/web', { logger })).toBeNull()
  })

  it('keeps today’s behaviour when the settings cannot be read', async () => {
    getJevDocument.mockRejectedValue(new Error('db down'))

    expect(await loadAutoApproveRepo('acme/web', { logger })).toBeNull()
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

describe('decideAutoApprove', () => {
  it('keeps today’s event for repos that are not listed', async () => {
    const result = await decideAutoApprove({ ...context(), repo: null, todayEvent: 'APPROVE' }, { logger })

    expect(result).toEqual({ event: 'APPROVE', autoApprove: null })
    expect(runJevCheck).not.toHaveBeenCalled()
  })

  it('never approves a repo set to off and does not evaluate it', async () => {
    const result = await decideAutoApprove(context({ mode: 'off', todayEvent: 'APPROVE' }), { logger })

    expect(result).toEqual({ event: 'COMMENT', autoApprove: null })
    expect(recordAutoApproveEvaluation).not.toHaveBeenCalled()
  })

  it('approves an on repo when no gate or question vetoes, and sends Jev the PR and the review facts', async () => {
    answered([row('rule:ci', 'No checks'), row('rule:nitpicks', 'Yes'), row('q1', 'No')])

    const { event, autoApprove } = await decideAutoApprove(context(), { logger })

    expect(event).toBe('APPROVE')
    expect(autoApprove).toMatchObject({
      repo: 'acme/web',
      mode: 'on',
      approve: true,
      decidedBy: 'jev',
      reason: null,
      pendingOnly: false,
      setVersion: 9,
      model: 'jev-1.14.0',
    })
    expect(autoApprove.gates).toEqual([
      { ...row('rule:ci', 'No checks'), label: 'CI status', role: 'veto', limit: null },
      { ...row('rule:nitpicks', 'Yes'), label: 'Max nitpicks', role: 'veto', limit: 3 },
    ])
    expect(autoApprove.questions).toEqual([row('q1', 'No')])

    const [{ project, state }] = runJevCheck.mock.calls[0]
    expect(project).toBe('github')
    expect(state.pullRequest).toEqual({ repository: 'acme/web', number: 12, title: 'Fix totals', description: 'Desc' })
    expect(state.review).toMatchObject({ ciStatus: 'no checks', denylistMatches: ['src/payments/fees.js'] })
    expect(state.diff).toBe('--- src/payments/fees.js\n+fee')
    expect(recordAutoApproveEvaluation).toHaveBeenCalledWith({
      repo: 'acme/web',
      prNumber: 12,
      headSha: 'abc123',
      mode: 'on',
      wouldApprove: true,
      decidedBy: 'jev',
    })
  })

  it('only logs what it would do in shadow', async () => {
    answered([row('q1', 'No')])

    const { event, autoApprove } = await decideAutoApprove(context({ mode: 'shadow' }), { logger })

    expect(event).toBe('COMMENT')
    expect(autoApprove).toMatchObject({ mode: 'shadow', approve: true })
    expect(recordAutoApproveEvaluation.mock.calls[0][0]).toMatchObject({ mode: 'shadow', wouldApprove: true })
  })

  it('does not approve when Jev vetoes or is not sure', async () => {
    answered([row('q1', 'Yes', { flagged: true }), row('q2', 'No', { unsure: true })])

    const { event, autoApprove } = await decideAutoApprove(context(), { logger })

    expect(event).toBe('COMMENT')
    expect(autoApprove).toMatchObject({ approve: false, pendingOnly: false })
  })

  it('says when only a pending CI holds the approval back', async () => {
    answered([row('rule:ci', 'Pending', { flagged: true }), row('q1', 'No')])

    const { autoApprove } = await decideAutoApprove(context(), { logger })

    expect(autoApprove).toMatchObject({ approve: false, pendingOnly: true })
  })

  it('decides as today when Jev is off for the repo', async () => {
    const { event, autoApprove } = await decideAutoApprove(context({ jev: false, todayEvent: 'APPROVE' }), { logger })

    expect(event).toBe('APPROVE')
    expect(autoApprove).toMatchObject({ approve: true, decidedBy: 'today', reason: 'Jev is off for this repo' })
    expect(runJevCheck).not.toHaveBeenCalled()
  })

  it('decides as today when Jev is unavailable', async () => {
    runJevCheck.mockResolvedValue({
      status: 'unavailable',
      setVersion: 9,
      model: 'jev-latest',
      reason: 'Jev error (HTTP 502)',
    })

    const { event, autoApprove } = await decideAutoApprove(context({ todayEvent: 'COMMENT' }), { logger })

    expect(event).toBe('COMMENT')
    expect(autoApprove).toMatchObject({
      approve: false,
      decidedBy: 'today',
      reason: 'Jev error (HTTP 502)',
      setVersion: 9,
      model: 'jev-latest',
      gates: [],
      questions: [],
    })
  })

  it('decides as today when asking Jev fails unexpectedly', async () => {
    runJevCheck.mockRejectedValue(new Error('boom'))

    const { autoApprove } = await decideAutoApprove(context({ todayEvent: 'APPROVE' }), { logger })

    expect(autoApprove).toMatchObject({ approve: true, decidedBy: 'today', reason: 'the Jev check failed' })
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it('still decides when the evaluation cannot be recorded', async () => {
    answered([row('q1', 'No')])
    recordAutoApproveEvaluation.mockRejectedValue(new Error('db down'))

    const { event } = await decideAutoApprove(context(), { logger })

    expect(event).toBe('APPROVE')
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
