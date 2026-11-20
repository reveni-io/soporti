import { describe, it, expect, vi, beforeEach } from 'vitest'

const listUsableGuards = vi.fn()
vi.mock('../guards/registry.js', () => ({ listUsableGuards }))

const buildGuardTools = vi.fn()
vi.mock('../agent/guard-tools.js', () => ({ buildGuardTools }))

const { buildReviewGuards, decideAutoApprove } = await import('./auto-approve.js')

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
const GUARDS = [{ id: 'github', name: 'GitHub Review PR' }]
const ASK_GUARD = { name: 'ask_guard' }
const CONTEXT = {
  pullRequest: { repoFullName: 'acme/web', prNumber: 12, title: 'Fix totals', body: 'Desc' },
  files: [
    { filename: 'src/payments/fees.js', patch: '+fee' },
    { filename: 'package-lock.json', patch: '+x', generated: true },
    { filename: 'logo.png' },
  ],
}

function row(question, { flagged = false, unsure = false } = {}) {
  return { questionId: question, question, answer: 'No', confidence: 0.9, flagged, unsure }
}

function guardCheck(guard, rows = [row('Is it risky?')]) {
  return { guard, status: 'checked', reason: null, warnings: 0, review: { setVersion: 9, minConfidence: 0.75, rows } }
}

beforeEach(() => {
  vi.clearAllMocks()
  listUsableGuards.mockResolvedValue(GUARDS)
  buildGuardTools.mockReturnValue([ASK_GUARD])
})

describe('buildReviewGuards', () => {
  it('gives the review ask_guard with the pull request and its diff attached, and collects what the guards answer', async () => {
    const guards = await buildReviewGuards(CONTEXT, { logger })

    expect(guards.tools).toEqual([ASK_GUARD])
    const [{ guards: passed, review }] = buildGuardTools.mock.calls[0]
    expect(passed).toBe(GUARDS)
    expect(review.attach).toEqual({
      pullRequest: { repository: 'acme/web', number: 12, title: 'Fix totals', description: 'Desc' },
      diff: '--- src/payments/fees.js\n+fee',
    })

    review.onChecked(guardCheck('GitHub Review PR'))
    expect(guards.checks).toEqual([guardCheck('GitHub Review PR')])
  })

  it('gives no tool when no guard can run, or the guards cannot be read', async () => {
    listUsableGuards.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('db down'))

    expect(await buildReviewGuards(CONTEXT, { logger })).toEqual({ tools: [], checks: [] })
    expect(await buildReviewGuards(CONTEXT, { logger })).toEqual({ tools: [], checks: [] })
    expect(buildGuardTools).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

describe('decideAutoApprove', () => {
  it('keeps today’s event when the review passed no guard', () => {
    expect(decideAutoApprove({ todayEvent: 'APPROVE', guardChecks: [] })).toEqual({
      event: 'APPROVE',
      autoApprove: null,
    })
  })

  it('approves as today when every guard answered with no warning', () => {
    const result = decideAutoApprove({
      todayEvent: 'APPROVE',
      guardChecks: [guardCheck('GitHub Review PR'), guardCheck('Payments')],
    })

    expect(result.event).toBe('APPROVE')
    expect(result.autoApprove).toEqual({
      approve: true,
      reason: null,
      checks: [
        {
          guard: 'GitHub Review PR',
          answered: true,
          reason: null,
          setVersion: 9,
          minConfidence: 0.75,
          rows: [row('Is it risky?')],
        },
        expect.objectContaining({ guard: 'Payments', answered: true }),
      ],
    })
  })

  it('never approves on its own: a PR today’s review would not approve keeps its event', () => {
    const result = decideAutoApprove({ todayEvent: 'COMMENT', guardChecks: [guardCheck('Payments')] })

    expect(result).toMatchObject({ event: 'COMMENT', autoApprove: { approve: true } })
  })

  it('does not approve when a guard warns or is not sure', () => {
    const result = decideAutoApprove({
      todayEvent: 'APPROVE',
      guardChecks: [guardCheck('GitHub Review PR'), guardCheck('Payments', [row('Big?', { unsure: true })])],
    })

    expect(result).toMatchObject({ event: 'COMMENT', autoApprove: { approve: false, reason: null } })
  })

  it('does not approve when a guard could not run', () => {
    const failed = { guard: 'Payments', status: 'not_checked', reason: 'the review could not run', review: null }

    const result = decideAutoApprove({ todayEvent: 'APPROVE', guardChecks: [failed] })

    expect(result.event).toBe('COMMENT')
    expect(result.autoApprove).toMatchObject({
      approve: false,
      reason: 'the Payments guard could not run (the review could not run)',
    })
    expect(result.autoApprove.checks[0]).toMatchObject({ answered: false, rows: [] })
  })
})
