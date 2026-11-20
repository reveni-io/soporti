import { describe, it, expect } from 'vitest'
import { describeGithubChanges, findGithubSaveError, parseGithubRepos } from './github-project.js'

function repo(overrides = {}) {
  return { name: 'acme/web', mode: 'off', ...overrides }
}

describe('parseGithubRepos', () => {
  it('keeps the name and the mode of each repo, trimmed, and drops anything else', () => {
    expect(parseGithubRepos([{ name: ' acme/web ', mode: 'shadow', jev: false, denylist: ['src/**'] }])).toEqual({
      value: [{ name: 'acme/web', mode: 'shadow' }],
    })
  })

  it.each([
    ['none', 'Repos must be a list.'],
    [
      Array.from({ length: 101 }, (_, index) => repo({ name: `acme/repo-${index}` })),
      'Auto-approve can list at most 100 repos.',
    ],
    [[repo({ name: 'acme' })], 'Use the org/repo format for every repo, e.g. acme/docs.'],
    [[repo({ mode: 'maybe' })], 'acme/web: the mode must be off, shadow or on.'],
    [[repo(), repo()], 'A repo appears twice.'],
  ])('rejects %j', (value, error) => {
    expect(parseGithubRepos(value)).toEqual({ error })
  })
})

describe('describeGithubChanges', () => {
  it('describes removed, added and changed repos', () => {
    const previous = { repos: [repo(), repo({ name: 'acme/docs', mode: 'shadow' })] }
    const next = { repos: [repo({ mode: 'shadow' }), repo({ name: 'acme/api' })] }

    expect(describeGithubChanges(previous, next)).toEqual([
      'Removed acme/docs',
      'acme/web off → shadow',
      'Added acme/api (off)',
    ])
  })

  it('handles a project saved before it had repos', () => {
    expect(describeGithubChanges({}, { repos: [repo()] })).toEqual(['Added acme/web (off)'])
  })
})

describe('findGithubSaveError', () => {
  it('lets a repo saved in shadow or on go on, and lists every other one', () => {
    const previous = { repos: [repo({ mode: 'shadow' }), repo({ name: 'acme/api', mode: 'on' })] }
    const next = {
      repos: [
        repo({ mode: 'on' }),
        repo({ name: 'acme/api', mode: 'on' }),
        repo({ name: 'acme/docs', mode: 'on' }),
        repo({ name: 'acme/ops', mode: 'on' }),
      ],
    }

    expect(findGithubSaveError(previous, next)).toBe(
      'Shadow first: acme/docs, acme/ops must be saved in shadow before it can be set to on.'
    )
    expect(findGithubSaveError(previous, { repos: next.repos.slice(0, 2) })).toBeNull()
  })
})
