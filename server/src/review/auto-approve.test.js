import { describe, it, expect, vi, beforeEach } from 'vitest'

const runJevCheck = vi.fn()
vi.mock('../jev/check.js', () => ({ runJevCheck }))

const listGuards = vi.fn()
vi.mock('../guards/registry.js', () => ({ listGuards }))

const { decideAutoApprove, findNamedGuards } = await import('./auto-approve.js')

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
const GITHUB = { id: 'github', name: 'GitHub Review PR' }
const PAYMENTS = { id: 'guard-0a1b2c3d', name: 'Payments' }
const LEGAL = { id: 'legal', name: 'Legal' }
const LEGAL_REVIEW = { id: 'guard-1a2b3c4d', name: 'Legal Review' }
const REVIEW_MD = { path: 'REVIEW.md', content: 'Utiliza las Guards de: "GitHub Review PR" and Payments.' }

function context({ todayEvent = 'APPROVE', standards = [REVIEW_MD] } = {}) {
  return {
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
  listGuards.mockResolvedValue([GITHUB, PAYMENTS, LEGAL])
  runJevCheck.mockResolvedValue(answered())
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
  it.each([
    ['has no REVIEW.md', [{ path: 'CLAUDE.md', content: 'Payments' }]],
    ['names no guard in its REVIEW.md', [{ path: 'apps/REVIEW.md', content: 'Be kind.' }]],
  ])('keeps today’s event and runs no guard when the repo %s', async (_case, standards) => {
    expect(await decideAutoApprove(context({ standards }), { logger })).toEqual({ event: 'APPROVE', autoApprove: null })
    expect(await decideAutoApprove(context({ standards, todayEvent: 'COMMENT' }), { logger })).toEqual({
      event: 'COMMENT',
      autoApprove: null,
    })
    expect(runJevCheck).not.toHaveBeenCalled()
  })

  it('passes the PR through every guard its REVIEW.md names and approves as today when none warns', async () => {
    const result = await decideAutoApprove(context(), { logger })

    expect(result.event).toBe('APPROVE')
    expect(result.autoApprove).toMatchObject({ approve: true, reason: null })
    expect(result.autoApprove.checks.map(check => check.guard)).toEqual(['GitHub Review PR', 'Payments'])
    expect(runJevCheck.mock.calls.map(([{ project }]) => project)).toEqual(['github', 'guard-0a1b2c3d'])
    const { state } = runJevCheck.mock.calls[0][0]
    expect(state.pullRequest).toEqual({ repository: 'acme/web', number: 12, title: 'Fix totals', description: 'Desc' })
    expect(state.review.ciStatus).toBe('no checks')
    expect(state.diff).toBe('--- src/payments/fees.js\n+fee')
  })

  it('never approves on its own: a PR today’s review would not approve keeps its event', async () => {
    const result = await decideAutoApprove(context({ todayEvent: 'COMMENT' }), { logger })

    expect(result).toMatchObject({ event: 'COMMENT', autoApprove: { approve: true } })
  })

  it('does not approve when a guard warns or is not sure', async () => {
    runJevCheck.mockResolvedValueOnce(answered()).mockResolvedValueOnce(answered([row('Big?', { unsure: true })]))

    const result = await decideAutoApprove(context(), { logger })

    expect(result).toMatchObject({ event: 'COMMENT', autoApprove: { approve: false, reason: null } })
  })

  it('does not approve when a guard named could not run', async () => {
    runJevCheck.mockResolvedValueOnce({ status: 'unavailable', setVersion: 2, reason: 'Jev calls are off' })

    const result = await decideAutoApprove(context(), { logger })

    expect(result.event).toBe('COMMENT')
    expect(result.autoApprove).toMatchObject({
      approve: false,
      reason: 'the GitHub Review PR guard could not run (Jev calls are off)',
    })
    expect(result.autoApprove.checks[0]).toMatchObject({ answered: false, rows: [] })
  })

  it('does not approve when the guards cannot be read', async () => {
    listGuards.mockRejectedValue(new Error('db down'))

    const result = await decideAutoApprove(context(), { logger })

    expect(result).toEqual({
      event: 'COMMENT',
      autoApprove: { approve: false, reason: 'the guards could not run', checks: [] },
    })
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
