import { describe, it, expect } from 'vitest'
import { describeJevPass, renderAutoApprove, renderJevAnswers } from './render-auto-approve.js'

function row(question, { flagged = false, unsure = false, confidence = 0.9 } = {}) {
  return { questionId: question, question, answer: 'No', confidence, flagged, unsure }
}

function check(guard, rows = [row('Is it risky?')]) {
  return { guard, answered: true, reason: null, setVersion: 4, minConfidence: 0.75, rows }
}

function autoApprove(overrides = {}) {
  return {
    approve: true,
    checks: [check('GitHub Review PR'), check('Payments')],
    ...overrides,
  }
}

describe('renderAutoApprove', () => {
  it('says every guard passed raised no warning', () => {
    const text = renderAutoApprove(autoApprove())

    expect(text).toContain('✅ Guards · no warnings')
    expect(text).toContain(
      'Soporti passed this PR through the **GitHub Review PR** and **Payments** guards, and none raised a warning.'
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

  it('says which guards could not run and did not count', () => {
    const skipped = { guard: 'Legal', answered: false, reason: 'No API key saved', rows: [] }

    const alone = renderAutoApprove(autoApprove({ checks: [skipped] }))
    const withOthers = renderAutoApprove(autoApprove({ checks: [check('Payments'), skipped] }))

    expect(alone).toContain('⚪ Guards · could not run')
    expect(alone).toContain(
      'The **Legal** guard could not run (No API key saved), so it did not count. The usual rule decided.'
    )
    expect(withOthers).toContain(
      'Soporti passed this PR through the **Payments** guard, and none raised a warning. The **Legal** guard could not run (No API key saved), so it did not count.'
    )
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

    expect(text).toContain('🛡️ Payments · 2 warnings · set v4')
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
