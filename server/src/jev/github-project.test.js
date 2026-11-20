import { describe, it, expect } from 'vitest'
import { describeGithubChanges, findGithubSaveError, parseGithubRepos, parseGithubRules } from './github-project.js'

function repo(overrides = {}) {
  return { name: 'acme/web', mode: 'off', jev: true, denylist: [], ...overrides }
}

describe('parseGithubRules', () => {
  it('keeps the limit only for the rules that have one', () => {
    expect(
      parseGithubRules([
        { id: 'ci', role: 'veto', limit: 'ignored' },
        { id: 'nitpicks', role: 'info', limit: 0 },
      ])
    ).toEqual({
      value: [
        { id: 'ci', role: 'veto' },
        { id: 'nitpicks', role: 'info', limit: 0 },
      ],
    })
  })

  it.each([
    ['none', 'Rules must be a list.'],
    [[{ id: 'coverage', role: 'veto' }], 'Unknown rule.'],
    [[{ id: 'ci', role: 'gate' }], 'CI status: the role must be veto or info.'],
    [[{ id: 'review-effort', role: 'veto', limit: 15 }], 'Max review effort: choose one of the limits.'],
    [
      [
        { id: 'ci', role: 'veto' },
        { id: 'ci', role: 'info' },
      ],
      'A rule appears twice.',
    ],
  ])('rejects %j', (rules, error) => {
    expect(parseGithubRules(rules)).toEqual({ error })
  })
})

describe('parseGithubRepos', () => {
  it('trims the names and patterns, drops empty patterns and keeps Jev on by default', () => {
    expect(parseGithubRepos([{ name: ' acme/web ', mode: 'shadow', denylist: [' src/payments/** ', ''] }])).toEqual({
      value: [{ name: 'acme/web', mode: 'shadow', jev: true, denylist: ['src/payments/**'] }],
    })
    expect(parseGithubRepos([repo({ jev: false })]).value[0].jev).toBe(false)
  })

  it.each([
    ['none', 'Repos must be a list.'],
    [Array.from({ length: 101 }, (_, i) => repo({ name: `acme/r${i}` })), 'Auto-approve can list at most 100 repos.'],
    [[repo({ name: 'acme' })], 'Use the org/repo format for every repo, e.g. acme/docs.'],
    [[repo({ mode: 'auto' })], 'acme/web: the mode must be off, shadow or on.'],
    [[repo({ denylist: 'src/**' })], 'acme/web: the denylist must be a list of paths.'],
    [[repo({ denylist: Array.from({ length: 101 }, () => 'a') })], 'acme/web: the denylist can have at most 100'],
    [[repo({ denylist: [7] })], 'acme/web: each denylist pattern must be text'],
    [[repo(), repo()], 'A repo appears twice.'],
  ])('rejects %j', (repos, error) => {
    expect(parseGithubRepos(repos).error).toContain(error)
  })
})

describe('describeGithubChanges', () => {
  it('describes removed, added and changed repos and the rules', () => {
    const previous = {
      set: { rules: [{ id: 'ci', role: 'veto' }] },
      repos: [repo({ name: 'acme/old' }), repo({ mode: 'shadow' })],
    }
    const next = {
      set: { rules: [] },
      repos: [repo({ mode: 'on', jev: false, denylist: ['src/**'] }), repo({ name: 'acme/new' })],
    }

    expect(describeGithubChanges(previous, next)).toEqual([
      'Removed acme/old',
      'acme/web shadow → on',
      'acme/web: Jev off',
      'acme/web: denylist',
      'Added acme/new (off)',
      'Rules',
    ])
  })

  it('handles a project saved before it had repos', () => {
    expect(describeGithubChanges({ set: { rules: [] } }, { set: { rules: [] }, repos: [repo()] })).toEqual([
      'Added acme/web (off)',
    ])
  })
})

describe('findGithubSaveError', () => {
  it('lets a repo saved in shadow or on go on, and lists every other one', () => {
    const previous = { repos: [repo({ name: 'acme/a', mode: 'shadow' }), repo({ name: 'acme/b', mode: 'on' })] }
    const next = {
      set: { questions: [{}] },
      repos: [
        repo({ name: 'acme/a', mode: 'on' }),
        repo({ name: 'acme/b', mode: 'on' }),
        repo({ name: 'acme/c', mode: 'on' }),
        repo({ name: 'acme/d', mode: 'on' }),
      ],
    }

    expect(findGithubSaveError(previous, next)).toBe(
      'Shadow first: acme/c, acme/d must be saved in shadow before it can be set to on.'
    )
    expect(findGithubSaveError(previous, { ...next, repos: next.repos.slice(0, 2) })).toBeNull()
  })

  it('lets the set be emptied when every repo is off', () => {
    expect(findGithubSaveError({ repos: [] }, { set: { questions: [] }, repos: [repo()] })).toBeNull()
  })

  it('lets repos be added before the set has any question', () => {
    const repos = [repo({ name: 'acme/a', mode: 'shadow' })]

    expect(findGithubSaveError({ set: { questions: [] }, repos: [] }, { set: { questions: [] }, repos })).toBeNull()
  })

  it('names the repos that still use the set', () => {
    const repos = [repo({ name: 'acme/a', mode: 'shadow' }), repo({ name: 'acme/b', mode: 'shadow' })]

    expect(findGithubSaveError({ set: { questions: [{ id: 'q1' }] }, repos }, { set: { questions: [] }, repos })).toBe(
      'Cannot delete the set: 2 auto-approve repos (acme/a, acme/b) use it. Set them to off and save first.'
    )
  })
})
