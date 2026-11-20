import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJevDocument = vi.fn()
vi.mock('../db/jev-documents.js', () => ({ getJevDocument }))

const recordAutoApproveEvaluation = vi.fn()
vi.mock('../db/auto-approve-evaluations.js', () => ({ recordAutoApproveEvaluation }))

const runJevCheck = vi.fn()
vi.mock('../jev/check.js', () => ({ runJevCheck }))

const listGuards = vi.fn()
vi.mock('../guards/registry.js', () => ({ listGuards }))

const { decideAutoApprove, findNamedGuards, loadAutoApproveRepo } = await import('./auto-approve.js')

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
const GITHUB = { id: 'github', name: 'GitHub Review PR' }
const PAYMENTS = { id: 'guard-0a1b2c3d', name: 'Payments' }
const LEGAL = { id: 'legal', name: 'Legal' }
const LEGAL_REVIEW = { id: 'guard-1a2b3c4d', name: 'Legal Review' }
const REVIEW_MD = { path: 'REVIEW.md', content: 'Utiliza las Guards de: "GitHub Review PR" and Payments.' }

function context({ mode = 'on', todayEvent = 'COMMENT', standards = [REVIEW_MD] } = {}) {
  return {
    repo: { name: 'acme/web', mode },
    todayEvent,
    standards: { documents: standards },
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

function row(question, { flagged = false, unsure = false } = {}) {
  return { questionId: question, question, answer: 'No', confidence: 0.9, flagged, unsure }
}

function answered(rows = [row('Is it risky?')]) {
  return { status: 'answered', setVersion: 9, model: 'jev-1.14.0', minConfidence: 0.75, rows }
}

beforeEach(() => {
  vi.clearAllMocks()
  recordAutoApproveEvaluation.mockResolvedValue()
  listGuards.mockResolvedValue([GITHUB, PAYMENTS, LEGAL])
  runJevCheck.mockResolvedValue(answered())
})

describe('loadAutoApproveRepo', () => {
  it('finds the repo regardless of the case of its name', async () => {
    getJevDocument.mockResolvedValue({ data: { repos: [{ name: 'Acme/Web', mode: 'shadow' }] } })

    expect(await loadAutoApproveRepo('acme/web', { logger })).toEqual({ name: 'Acme/Web', mode: 'shadow' })
    expect(getJevDocument).toHaveBeenCalledWith('auto-approve')
  })

  it('treats a missing document or repo as not listed', async () => {
    getJevDocument.mockResolvedValue(null)

    expect(await loadAutoApproveRepo('acme/web', { logger })).toBeNull()
  })

  it('keeps today’s behaviour when the settings cannot be read', async () => {
    getJevDocument.mockRejectedValue(new Error('db down'))

    expect(await loadAutoApproveRepo('acme/web', { logger })).toBeNull()
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

describe('findNamedGuards', () => {
  it('takes the guards whose whole name appears in the text, in any case, the longest name first', () => {
    const guards = [LEGAL, LEGAL_REVIEW, PAYMENTS, GITHUB]

    expect(findNamedGuards(guards, 'Use the guards: "legal review".')).toEqual([LEGAL_REVIEW])
    expect(findNamedGuards(guards, 'Legal and Legal Review')).toEqual([LEGAL, LEGAL_REVIEW])
    expect(findNamedGuards(guards, 'Paymentsflow, illegal')).toEqual([])
  })
})

describe('decideAutoApprove', () => {
  it('keeps today’s event for a repo that is not listed, and evaluates nothing in off', async () => {
    expect(await decideAutoApprove({ ...context(), repo: null, todayEvent: 'APPROVE' }, { logger })).toEqual({
      event: 'APPROVE',
      autoApprove: null,
    })
    expect(await decideAutoApprove(context({ mode: 'off' }), { logger })).toEqual({
      event: 'COMMENT',
      autoApprove: null,
    })
    expect(runJevCheck).not.toHaveBeenCalled()
  })

  it('approves an on repo when every guard its REVIEW.md names answers with no warning', async () => {
    const result = await decideAutoApprove(context(), { logger })

    expect(result.event).toBe('APPROVE')
    expect(result.autoApprove).toMatchObject({
      repo: 'acme/web',
      mode: 'on',
      approve: true,
      decidedBy: 'jev',
      reason: null,
    })
    expect(result.autoApprove.checks.map(check => check.guard)).toEqual(['GitHub Review PR', 'Payments'])
    expect(runJevCheck.mock.calls.map(([{ project }]) => project)).toEqual(['github', 'guard-0a1b2c3d'])
    const { state } = runJevCheck.mock.calls[0][0]
    expect(state.pullRequest).toEqual({ repository: 'acme/web', number: 12, title: 'Fix totals', description: 'Desc' })
    expect(state.review.ciStatus).toBe('no checks')
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

  it('does not approve when a guard warns or is not sure', async () => {
    runJevCheck.mockResolvedValueOnce(answered()).mockResolvedValueOnce(answered([row('Big?', { unsure: true })]))

    const result = await decideAutoApprove(context(), { logger })

    expect(result).toMatchObject({ event: 'COMMENT', autoApprove: { approve: false, reason: null } })
  })

  it('does not approve when a guard named could not run', async () => {
    runJevCheck.mockResolvedValueOnce({ status: 'unavailable', setVersion: 2, reason: 'Jev calls are off' })

    const result = await decideAutoApprove(context(), { logger })

    expect(result.autoApprove).toMatchObject({
      approve: false,
      reason: 'the GitHub Review PR guard could not run (Jev calls are off)',
    })
    expect(result.autoApprove.checks[0]).toMatchObject({ answered: false, rows: [] })
  })

  it.each([
    ['has no REVIEW.md', [{ path: 'CLAUDE.md', content: 'Payments' }], 'the repo has no REVIEW.md'],
    [
      'names no guard in its REVIEW.md',
      [{ path: 'apps/REVIEW.md', content: 'Be kind.' }],
      'its REVIEW.md names no guard',
    ],
  ])('never approves a repo that %s, and runs no guard', async (_case, standards, reason) => {
    const result = await decideAutoApprove(context({ standards }), { logger })

    expect(result).toEqual({
      event: 'COMMENT',
      autoApprove: { repo: 'acme/web', mode: 'on', approve: false, decidedBy: 'none', reason, checks: [] },
    })
    expect(runJevCheck).not.toHaveBeenCalled()
  })

  it('evaluates a shadow repo without approving it', async () => {
    const result = await decideAutoApprove(context({ mode: 'shadow' }), { logger })

    expect(result).toMatchObject({ event: 'COMMENT', autoApprove: { mode: 'shadow', approve: true } })
  })

  it('does not approve when the guards cannot be read, and still records the evaluation', async () => {
    listGuards.mockRejectedValue(new Error('db down'))
    recordAutoApproveEvaluation.mockRejectedValue(new Error('db down'))

    const result = await decideAutoApprove(context(), { logger })

    expect(result.autoApprove).toMatchObject({ approve: false, reason: 'the guards could not run' })
    expect(logger.error).toHaveBeenCalledTimes(2)
  })
})
