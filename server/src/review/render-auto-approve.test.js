import { describe, it, expect } from 'vitest'
import { describeJevPass, renderAutoApprove, renderJevAnswers } from './render-auto-approve.js'

function row(question, { flagged = false, unsure = false, confidence = 0.9 } = {}) {
  return { questionId: question, question, answer: 'No', confidence, flagged, unsure }
}

function check(guard, rows = [row('Is it risky?')]) {
  return { guard, answered: true, reason: null, setVersion: 4, model: 'jev-1', minConfidence: 0.75, rows }
}

function autoApprove(overrides = {}) {
  return {
    approve: true,
    reason: null,
    checks: [check('GitHub Review PR'), check('Payments')],
    ...overrides,
  }
}

describe('renderAutoApprove', () => {
  it('says every guard REVIEW.md names raised no warning', () => {
    const text = renderAutoApprove(autoApprove())

    expect(text).toContain('✅ Guards · no warnings')
    expect(text).toContain(
      'REVIEW.md names the **GitHub Review PR** and **Payments** guards, and none raised a warning.'
    )
  })

  it('names the guards that warned', () => {
    const text = renderAutoApprove(
      autoApprove({
        approve: false,
        checks: [check('GitHub Review PR'), check('Payments', [row('Fees?', { flagged: true })])],
      })
    )

    expect(text).toContain('⛔ Guards · not approved')
    expect(text).toContain(
      'Soporti did not approve this PR because the **Payments** guard raised a warning. Review it as usual.'
    )
  })

  it('gives the reason when the guards could not run', () => {
    const text = renderAutoApprove(autoApprove({ approve: false, reason: 'the guards could not run', checks: [] }))

    expect(text).toContain('Soporti did not approve this PR because the guards could not run. Review it as usual.')
  })

  it('renders nothing when no guard ran', () => {
    expect(renderAutoApprove(null)).toBeNull()
  })
})

describe('renderJevAnswers', () => {
  it('lists the answers of each guard that answered, with the warnings', () => {
    const text = renderJevAnswers(
      autoApprove({
        checks: [
          check('Payments', [row('Fees?', { flagged: true }), row('Big?', { unsure: true, confidence: 0.5 })]),
          { guard: 'Legal', answered: false, reason: 'Jev calls are off', rows: [] },
        ],
      })
    )

    expect(text).toContain('🛡️ Payments · 2 warnings · set v4 · jev-1')
    expect(text).toContain('| Fees? | No | 0.90 | ⛔ Warning |')
    expect(text).toContain('| Big? | No | 0.50 | ⛔ Warning (not sure: 0.50 < 0.75) |')
    expect(text).not.toContain('Legal')
  })

  it('renders nothing when no guard answered', () => {
    expect(renderJevAnswers(autoApprove({ checks: [] }))).toBeNull()
    expect(renderJevAnswers(null)).toBeNull()
  })
})

describe('describeJevPass', () => {
  it('names the guards that ran, and says when one could not', () => {
    expect(describeJevPass(autoApprove())).toBe(', guards (GitHub Review PR, Payments)')
    expect(describeJevPass(autoApprove({ checks: [{ guard: 'Legal', answered: false, rows: [] }] }))).toBe(
      ', guards (Legal) (⚠️ unavailable)'
    )
    expect(describeJevPass(null)).toBe('')
  })
})
