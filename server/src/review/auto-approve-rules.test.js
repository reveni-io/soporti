import { describe, it, expect } from 'vitest'
import { buildRuleQuestions, checkRuleFact, collectReviewFacts, ruleIdOf } from './auto-approve-rules.js'

function review(overrides = {}) {
  return {
    ciStatus: { checks: [{ name: 'tests', state: 'completed' }], incomplete: false },
    findings: [],
    passes: [{ lens: 'overview', status: 'completed' }],
    notReviewed: [],
    overview: { reviewMinutes: 10 },
    history: { unresolvedThreads: 2 },
    fixedThreads: [{ id: 't1' }],
    files: [{ filename: 'apps/billing/models.py' }, { filename: 'src/app.js' }],
    ...overrides,
  }
}

function factsOf(overrides, denylist = []) {
  return collectReviewFacts(review(overrides), denylist)
}

describe('collectReviewFacts', () => {
  it('summarizes the review for Jev', () => {
    expect(factsOf({}, ['apps/billing/**'])).toEqual({
      ciStatus: 'passed',
      blockingFindings: [],
      specCheck: 'no spec',
      unresolvedThreads: 1,
      walkthrough: 'posted',
      mergeRisk: 'Low',
      estimatedReviewMinutes: 10,
      nitpicks: 0,
      denylistMatches: ['apps/billing/models.py'],
    })
  })

  it.each([
    [null, 'unknown'],
    [{ checks: [], incomplete: false }, 'no checks'],
    [{ checks: [], incomplete: true }, 'unknown'],
    [{ checks: [{ state: 'pending' }, { state: 'completed' }], incomplete: false }, 'pending'],
    [{ checks: [{ state: 'pending' }, { state: 'failed' }], incomplete: true }, 'failed'],
  ])('reads the CI status %j as %s', (ciStatus, expected) => {
    expect(factsOf({ ciStatus }).ciStatus).toBe(expected)
  })

  it('lists the blocking findings, counts the nits and raises the merge risk', () => {
    const facts = factsOf({
      findings: [
        { severity: 'major', title: 'Totals are wrong', lens: 'correctness' },
        { severity: 'nit', title: 'Rename total', lens: 'correctness' },
      ],
    })

    expect(facts).toMatchObject({ blockingFindings: ['Totals are wrong'], nitpicks: 1, mergeRisk: 'Medium' })
  })

  it.each([
    [{ passes: [{ lens: 'spec', status: 'completed' }] }, 'no blocking finding'],
    [{ passes: [{ lens: 'spec', status: 'failed' }] }, 'unknown'],
    [
      {
        passes: [{ lens: 'spec', status: 'completed' }],
        findings: [{ severity: 'critical', title: 'Misses the story', lens: 'spec' }],
      },
      'blocking finding',
    ],
  ])('reads the spec check of %j', (overrides, expected) => {
    expect(factsOf(overrides).specCheck).toBe(expected)
  })

  it('says what it does not know', () => {
    expect(factsOf({ history: null, overview: null, notReviewed: ['src/app.js'] })).toMatchObject({
      unresolvedThreads: 'unknown',
      walkthrough: 'missing',
      estimatedReviewMinutes: 'unknown',
      mergeRisk: 'Unknown',
    })
  })

  it('matches the old path of a file moved out of the denylist', () => {
    const files = [{ filename: 'src/misc/fees.js', previous_filename: 'src/payments/fees.js' }]

    expect(factsOf({ files }, ['src/payments/**']).denylistMatches).toEqual(['src/payments/fees.js'])
  })

  it('matches unanchored denylist patterns at any depth', () => {
    expect(factsOf({}, ['*.py']).denylistMatches).toEqual(['apps/billing/models.py'])
    expect(factsOf({}, ['billing/**']).denylistMatches).toEqual([])
  })
})

describe('buildRuleQuestions', () => {
  it('turns a veto rule into a choice question whose bad answers veto', () => {
    const [question] = buildRuleQuestions([{ id: 'merge-risk', role: 'veto', limit: 'Medium' }])

    expect(question).toEqual({
      id: 'rule:merge-risk',
      type: 'choice',
      text: 'What is the merge risk?',
      instructions: 'Answer only from review.mergeRisk in the document.',
      criteria: '',
      answers: [
        { label: 'Low', criteria: '', flag: false },
        { label: 'Medium', criteria: '', flag: false },
        { label: 'High', criteria: '', flag: true },
        { label: 'Unknown', criteria: '', flag: true },
      ],
    })
  })

  it('asks an info rule without letting it veto', () => {
    const [question] = buildRuleQuestions([{ id: 'walkthrough', role: 'info' }])

    expect(question.answers.every(answer => !answer.flag)).toBe(true)
  })

  it('puts the limit in the question', () => {
    const questions = buildRuleQuestions([
      { id: 'review-effort', role: 'veto', limit: 20 },
      { id: 'nitpicks', role: 'veto', limit: 3 },
    ])

    expect(questions.map(question => question.text)).toEqual([
      'Is the estimated review effort at most 20 minutes?',
      'Are there at most 3 nitpicks?',
    ])
  })

  it.each(['ci', 'findings', 'spec', 'threads', 'denylist'])('builds the %s rule', id => {
    const [question] = buildRuleQuestions([{ id, role: 'veto' }])

    expect(question.answers.some(answer => answer.flag)).toBe(true)
  })
})

describe('checkRuleFact', () => {
  const FACTS = {
    ciStatus: 'passed',
    blockingFindings: [],
    specCheck: 'no spec',
    unresolvedThreads: 0,
    walkthrough: 'posted',
    mergeRisk: 'Low',
    estimatedReviewMinutes: 5,
    nitpicks: 2,
    denylistMatches: [],
  }

  it.each([
    [{ id: 'ci', role: 'veto' }, {}, 'Passed', false],
    [{ id: 'ci', role: 'veto' }, { ciStatus: 'unknown' }, 'Unknown', true],
    [{ id: 'findings', role: 'veto' }, { blockingFindings: ['Refund twice'] }, 'Yes', true],
    [{ id: 'spec', role: 'veto' }, {}, 'No spec', false],
    [{ id: 'spec', role: 'veto' }, { specCheck: 'unknown' }, 'Unknown', true],
    [{ id: 'threads', role: 'veto' }, { unresolvedThreads: 2 }, 'Yes', true],
    [{ id: 'threads', role: 'veto' }, { unresolvedThreads: 'unknown' }, 'Unknown', true],
    [{ id: 'walkthrough', role: 'veto' }, { walkthrough: 'missing' }, 'No', true],
    [{ id: 'merge-risk', role: 'veto', limit: 'Low' }, { mergeRisk: 'Medium' }, 'Medium', true],
    [{ id: 'merge-risk', role: 'veto', limit: 'Medium' }, { mergeRisk: 'Medium' }, 'Medium', false],
    [{ id: 'merge-risk', role: 'veto', limit: 'High' }, { mergeRisk: 'Unknown' }, 'Unknown', true],
    [{ id: 'review-effort', role: 'veto', limit: 10 }, { estimatedReviewMinutes: 15 }, 'No', true],
    [{ id: 'review-effort', role: 'veto', limit: 10 }, { estimatedReviewMinutes: 'unknown' }, 'Unknown', true],
    [{ id: 'nitpicks', role: 'veto', limit: 3 }, {}, 'Yes', false],
    [{ id: 'denylist', role: 'veto' }, { denylistMatches: ['src/payments/fees.js'] }, 'Yes', true],
    [{ id: 'denylist', role: 'info' }, { denylistMatches: ['src/payments/fees.js'] }, 'Yes', false],
  ])('checks %j against the review facts', (rule, facts, answer, vetoed) => {
    expect(checkRuleFact(rule, { ...FACTS, ...facts })).toEqual({ answer, vetoed })
  })
})

describe('ruleIdOf', () => {
  it('reads the rule of a generated question only', () => {
    expect(ruleIdOf('rule:ci')).toBe('ci')
    expect(ruleIdOf('q1')).toBeNull()
  })
})
