import { describe, it, expect } from 'vitest'
import { collectReviewFacts } from './review-facts.js'

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

function factsOf(overrides) {
  return collectReviewFacts(review(overrides))
}

describe('collectReviewFacts', () => {
  it('summarizes the review for Jev', () => {
    expect(factsOf({})).toEqual({
      ciStatus: 'passed',
      blockingFindings: [],
      specCheck: 'no spec',
      unresolvedThreads: 1,
      walkthrough: 'posted',
      mergeRisk: 'Low',
      estimatedReviewMinutes: 10,
      nitpicks: 0,
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
})
