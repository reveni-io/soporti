import { describe, it, expect } from 'vitest'
import { describeJevPass, renderAutoApprove, renderJevAnswers } from './render-auto-approve.js'

const GATES = [
  { questionId: 'rule:ci', label: 'CI status', role: 'veto', limit: null, answer: 'Passed', confidence: 0.97 },
  {
    questionId: 'rule:merge-risk',
    label: 'Max merge risk',
    role: 'veto',
    limit: 'Low',
    answer: 'Low',
    confidence: 0.9,
  },
  {
    questionId: 'rule:review-effort',
    label: 'Max review effort',
    role: 'veto',
    limit: 10,
    answer: 'Yes',
    confidence: 0.88,
  },
  { questionId: 'rule:walkthrough', label: 'Walkthrough', role: 'info', limit: null, answer: null, confidence: 0 },
].map(gate => ({ flagged: false, unsure: false, ...gate }))
const QUESTIONS = [
  {
    questionId: 'q1',
    question: 'Does it touch refunds?',
    answer: 'No',
    confidence: 0.95,
    flagged: false,
    unsure: false,
  },
  {
    questionId: 'q2',
    question: 'Could it leak personal data?',
    answer: 'No',
    confidence: 0.64,
    flagged: false,
    unsure: true,
  },
]

function outcome(overrides = {}) {
  return {
    repo: 'acme/web',
    mode: 'on',
    jevAsked: true,
    approve: true,
    decidedBy: 'jev',
    reason: null,
    pendingOnly: false,
    setVersion: 9,
    model: 'jev-1.14.0',
    minConfidence: 0.75,
    gates: GATES,
    questions: [QUESTIONS[0]],
    ...overrides,
  }
}

describe('renderAutoApprove', () => {
  it('renders nothing without an auto-approve decision', () => {
    expect(renderAutoApprove(null)).toBeNull()
  })

  it('explains an approval and lists every gate with its limit and Jev’s answer', () => {
    const body = renderAutoApprove(outcome())

    expect(body).toContain('<details open>\n<summary>✅ Auto-approve · approved</summary>')
    expect(body).toContain('`acme/web` is set to `on` and no gate or question vetoed it, so Soporti approved this PR.')
    expect(body).toContain('<summary>Gates (4)</summary>')
    expect(body).toContain('| CI status | veto | Passed | 0.97 | ✅ OK |')
    expect(body).toContain('| Max merge risk | ≤ Low | Low | 0.90 | ✅ OK |')
    expect(body).toContain('| Max review effort | ≤ 10 mins | Yes | 0.88 | ✅ OK |')
    expect(body).toContain('| Walkthrough | info | no answer | 0.00 | ➖ Info |')
  })

  it('shows a veto and an answer Jev was not sure about', () => {
    const gates = [
      { ...GATES[0], answer: 'Failed', flagged: true },
      { ...GATES[1], confidence: 0.5, unsure: true },
    ]

    const body = renderAutoApprove(outcome({ approve: false, gates }))

    expect(body).toContain('⛔ Auto-approve · not approved: Jev vetoed')
    expect(body).toContain('| CI status | veto | Failed | 0.97 | ⛔ Veto |')
    expect(body).toContain('| Max merge risk | ≤ Low | Low | 0.50 | ⛔ Veto (not sure: 0.50 < 0.75) |')
  })

  it('waits for a pending CI and says how to ask for a new review', () => {
    const body = renderAutoApprove(outcome({ approve: false, pendingOnly: true }), { reviewerLogin: 'reveni-dev' })

    expect(body).toContain('⏳ Auto-approve · not approved yet')
    expect(body).toContain('Soporti checks again on the next review: comment `@reveni-dev review` to request one.')
    expect(renderAutoApprove(outcome({ approve: false, pendingOnly: true }))).toContain('on the next review.')
  })

  it('only says what it would do in shadow', () => {
    expect(renderAutoApprove(outcome({ mode: 'shadow' }))).toContain('👁️ Auto-approve · shadow: would approve')
    expect(renderAutoApprove(outcome({ mode: 'shadow', approve: false, pendingOnly: true }))).toContain(
      'is in `shadow` mode and the CI gate has not passed yet, so Soporti would not have approved this PR.'
    )
    expect(renderAutoApprove(outcome({ mode: 'shadow', approve: false }))).toContain('and Jev vetoed the approval')
  })

  it('explains a decision taken as today without gates', () => {
    const unavailable = renderAutoApprove(
      outcome({ decidedBy: 'today', approve: true, reason: 'Jev error (HTTP 502)', gates: [] })
    )
    const jevOff = renderAutoApprove(outcome({ decidedBy: 'today', approve: false, jevAsked: false, gates: [] }))
    const shadow = renderAutoApprove(outcome({ decidedBy: 'today', mode: 'shadow', approve: true, gates: [] }))

    expect(unavailable).toContain('<summary>✅ Auto-approve · approved as today</summary>')
    expect(unavailable).toContain(
      'Jev could not decide (Jev error (HTTP 502)), so `acme/web` was decided as today: the change is trivial and nothing blocks it.'
    )
    expect(unavailable).not.toContain('Gates')
    expect(jevOff).toContain('⚪ Auto-approve · not approved as today')
    expect(jevOff).toContain('Jev is off for this repo, so `acme/web` was decided as today: only trivial changes')
    expect(shadow).toContain('👁️ Auto-approve · shadow: would approve as today')
    expect(shadow).toContain('Nothing was approved: review it as usual.')
  })
})

describe('renderJevAnswers', () => {
  it('collapses the project questions under a summary with the set version and model', () => {
    const body = renderJevAnswers(outcome())

    expect(body).toContain('<details>\n<summary>🛡️ Jev · no veto · set v9 · jev-1.14.0</summary>')
    expect(body).toContain('| Question | Jev’s answer | Confidence | Check |')
    expect(body).toContain('| Does it touch refunds? | No | 0.95 | ✅ OK |')
  })

  it('counts the answers that vetoed', () => {
    const body = renderJevAnswers(outcome({ questions: QUESTIONS }))

    expect(body).toContain('🛡️ Jev · vetoed · 1 answer · set v9')
    expect(body).toContain('| Could it leak personal data? | No | 0.64 | ⛔ Veto (not sure: 0.64 < 0.75) |')
    expect(renderJevAnswers(outcome({ questions: QUESTIONS.map(row => ({ ...row, flagged: true })) }))).toContain(
      'vetoed · 2 answers'
    )
  })

  it('renders nothing when Jev did not answer', () => {
    expect(renderJevAnswers(null)).toBeNull()
    expect(renderJevAnswers(outcome({ decidedBy: 'today' }))).toBeNull()
    expect(renderJevAnswers(outcome({ questions: [] }))).toBeNull()
  })
})

describe('describeJevPass', () => {
  it('adds jev to the passes when it was asked', () => {
    expect(describeJevPass(outcome())).toBe(', jev')
    expect(describeJevPass(outcome({ decidedBy: 'today' }))).toBe(', jev (⚠️ unavailable)')
    expect(describeJevPass(outcome({ jevAsked: false }))).toBe('')
    expect(describeJevPass(null)).toBe('')
  })
})
