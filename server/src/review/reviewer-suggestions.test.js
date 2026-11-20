import { describe, it, expect, vi, beforeEach } from 'vitest'

const getReviewerSuggestionsEnabled = vi.fn()
vi.mock('../github/settings.js', () => ({ getReviewerSuggestionsEnabled }))

const listPullRequestReviews = vi.fn()
const listPathAuthors = vi.fn()
const canPushToRepository = vi.fn()
const countReviewsSince = vi.fn()
const findFirstPullRequestDates = vi.fn()
vi.mock('../github/client.js', () => ({
  findFirstPullRequestDates,
  listPullRequestReviews,
  listPathAuthors,
  canPushToRepository,
  countReviewsSince,
}))

const { suggestReviewers } = await import('./reviewer-suggestions.js')

const logger = { error: vi.fn(), warn: vi.fn() }
const NOW = new Date('2026-11-20T10:00:00Z')

const VETERAN = '2023-01-10T09:00:00Z'
const FILE_HISTORY = [
  { path: 'src/a.js', authors: ['ana', 'ana', 'luis'] },
  { path: 'src/b.js', authors: ['ana', 'luis', 'marta'] },
]

function firstPullRequests(...entries) {
  const dates = new Map(entries)
  findFirstPullRequestDates.mockImplementation(async (_org, logins) => {
    return new Map(logins.map(login => [login, dates.has(login) ? dates.get(login) : VETERAN]))
  })
}

function folderAuthors(...logins) {
  listPathAuthors.mockImplementation(async (_repo, _ref, paths, options) => {
    return options ? paths.map(path => ({ path, authors: logins })) : FILE_HISTORY
  })
}

const TRIGGER = {
  repoFullName: 'acme-io/app',
  prNumber: 7,
  dedupeKey: 'acme-io/app#7',
  authorLogin: 'author',
  baseRef: 'main',
}

function buildContext(overrides = {}) {
  return {
    trigger: TRIGGER,
    pr: { requested_reviewers: [], requested_teams: [] },
    files: [
      { filename: 'src/a.js', changes: 40 },
      { filename: 'src/b.js', changes: 10 },
    ],
    reviewerLogin: 'soporti-bot',
    risk: 'Low',
    effort: 2,
    approved: false,
    ...overrides,
  }
}

function loads(entries) {
  countReviewsSince.mockImplementation(
    async (_owner, logins) => new Map(logins.map(login => [login, entries[login] ?? 0]))
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  getReviewerSuggestionsEnabled.mockResolvedValue(true)
  firstPullRequests()
  folderAuthors()
  listPullRequestReviews.mockResolvedValue([])
  canPushToRepository.mockResolvedValue(true)
  loads({})
})

describe('suggestReviewers', () => {
  it('does nothing while the switch is off', async () => {
    getReviewerSuggestionsEnabled.mockResolvedValue(false)

    expect(await suggestReviewers(buildContext(), { logger })).toBeNull()
    expect(listPullRequestReviews).not.toHaveBeenCalled()
  })

  it('suggests, among the people who touched most of the files, the one with fewer recent reviews', async () => {
    listPathAuthors.mockResolvedValue([
      { path: 'src/a.js', authors: ['ana', 'luis'] },
      { path: 'src/b.js', authors: ['ana', 'luis'] },
      { path: 'src/c.js', authors: ['ana', 'marta'] },
    ])
    loads({ ana: 6, luis: 2, marta: 0 })

    expect(await suggestReviewers(buildContext(), { logger })).toEqual({ expert: 'luis', learner: null })
    expect(listPathAuthors).toHaveBeenCalledWith('acme-io/app', 'main', ['src/a.js', 'src/b.js'])
    expect(countReviewsSince).toHaveBeenCalledWith('acme-io', ['ana', 'luis'], expect.any(String))
  })

  it('keeps the person who knows the files best on a tie', async () => {
    listPathAuthors.mockResolvedValue([
      { path: 'src/a.js', authors: ['luis'] },
      { path: 'src/b.js', authors: ['ana', 'luis'] },
    ])

    expect((await suggestReviewers(buildContext(), { logger })).expert).toBe('luis')
  })

  it('counts the reviews of the last 30 days', async () => {
    await suggestReviewers(buildContext(), { logger })

    expect(countReviewsSince.mock.calls[0][2]).toBe('2026-10-21')
  })

  it('reads the history of the biggest changes, skipping generated files and following renames', async () => {
    const files = [
      { filename: 'package-lock.json', changes: 900, generated: true },
      { filename: 'src/new-name.js', previous_filename: 'src/old-name.js', changes: 5 },
      ...Array.from({ length: 11 }, (_, index) => ({ filename: `src/f${index}.js`, changes: 100 - index })),
    ]

    await suggestReviewers(buildContext({ files }), { logger })

    const paths = listPathAuthors.mock.calls[0][2]
    expect(paths).toHaveLength(10)
    expect(paths).not.toContain('package-lock.json')
    expect(paths[0]).toBe('src/f0.js')

    listPathAuthors.mockClear()
    await suggestReviewers(buildContext({ files: files.slice(0, 2) }), { logger })
    expect(listPathAuthors.mock.calls[0][2]).toEqual(['src/old-name.js'])
  })

  it('leaves out the author, Soporti, bots and people without push access', async () => {
    listPathAuthors.mockResolvedValue([
      { path: 'src/a.js', authors: ['Author', 'soporti-bot', 'renovate[bot]', 'gone', 'ana'] },
    ])
    canPushToRepository.mockImplementation(async (_repo, login) => login !== 'gone')

    expect(await suggestReviewers(buildContext(), { logger })).toEqual({ expert: 'ana', learner: null })
  })

  it('suggests no expert once someone else is reviewing or a team is requested', async () => {
    listPullRequestReviews.mockResolvedValue([{ user: { login: 'marta' } }])
    expect(await suggestReviewers(buildContext(), { logger })).toBeNull()

    listPullRequestReviews.mockResolvedValue([])
    expect(
      await suggestReviewers(buildContext({ pr: { requested_teams: [{ slug: 'backend' }] } }), { logger })
    ).toBeNull()

    expect(
      await suggestReviewers(buildContext({ pr: { requested_reviewers: [{ login: 'luis' }] } }), { logger })
    ).toBeNull()
    expect(listPathAuthors).not.toHaveBeenCalledWith('acme-io/app', 'main', ['src/a.js', 'src/b.js'])
  })

  it('still suggests an expert when only the author, Soporti or a bot reviewed', async () => {
    listPullRequestReviews.mockResolvedValue([
      { user: { login: 'author' } },
      { user: { login: 'soporti-bot' } },
      { user: { login: 'coderabbit[bot]' } },
      { user: null },
    ])

    expect((await suggestReviewers(buildContext(), { logger })).expert).toBe('ana')
  })

  it('suggests no expert when Soporti approved the PR', async () => {
    expect(await suggestReviewers(buildContext({ approved: true }), { logger })).toBeNull()
    expect(listPathAuthors).not.toHaveBeenCalledWith('acme-io/app', 'main', ['src/a.js', 'src/b.js'])
  })

  it('suggests, among the people who committed lately in the folders of the PR, the newest one with fewer recent reviews', async () => {
    folderAuthors('nueva', 'nuevo', 'antigua', 'sin-prs', 'author', 'dependabot[bot]')
    firstPullRequests(
      ['nueva', '2026-10-01T09:00:00Z'],
      ['nuevo', '2026-05-25T10:00:00Z'],
      ['antigua', '2026-05-24T09:00:00Z'],
      ['sin-prs', null]
    )
    loads({ nueva: 3, nuevo: 1, 'sin-prs': 2 })

    expect(await suggestReviewers(buildContext({ risk: 'Medium', effort: 3 }), { logger })).toEqual({
      expert: 'ana',
      learner: 'nuevo',
    })
    expect(listPathAuthors).toHaveBeenCalledWith('acme-io/app', 'main', ['src'], { limit: 50 })
    expect(findFirstPullRequestDates).toHaveBeenCalledWith('acme-io', ['nueva', 'nuevo', 'antigua', 'sin-prs'])
    expect(countReviewsSince.mock.calls[0][1]).not.toContain('antigua')
  })

  it('reads each folder once and asks about 50 people at most', async () => {
    folderAuthors(...Array.from({ length: 60 }, (_, index) => `dev${index}`))
    const files = [
      { filename: 'apps/integrations/shopify/a.py', changes: 9 },
      { filename: 'apps/integrations/shopify/b.py', changes: 8 },
      { filename: 'apps/returns/c.py', changes: 7 },
    ]

    await suggestReviewers(buildContext({ files }), { logger })

    expect(listPathAuthors.mock.calls[1][2]).toEqual(['apps/integrations/shopify', 'apps/returns'])
    expect(findFirstPullRequestDates.mock.calls[0][1]).toHaveLength(50)
  })

  it('looks for no newcomer when the PR only changes files at the root of the repo', async () => {
    await suggestReviewers(buildContext({ files: [{ filename: 'README.md', changes: 3 }] }), { logger })

    expect(listPathAuthors).toHaveBeenCalledTimes(1)
    expect(findFirstPullRequestDates).not.toHaveBeenCalled()
  })

  it('suggests someone who works in the folders but has not opened a PR yet, even when the PR already has a reviewer', async () => {
    folderAuthors('nueva')
    firstPullRequests(['nueva', null])
    listPullRequestReviews.mockResolvedValue([{ user: { login: 'marta' } }])

    expect(await suggestReviewers(buildContext(), { logger })).toEqual({ expert: null, learner: 'nueva' })
  })

  it('does not suggest the expert again as the newcomer', async () => {
    listPathAuthors.mockResolvedValue([{ path: 'src/a.js', authors: ['ana'] }])
    firstPullRequests(['ana', '2026-11-01T09:00:00Z'])

    expect(await suggestReviewers(buildContext(), { logger })).toEqual({ expert: 'ana', learner: null })
  })

  it.each([
    ['high risk', { risk: 'High', effort: 2 }],
    ['unknown risk', { risk: 'Unknown', effort: 2 }],
    ['trivial change', { risk: 'Low', effort: 1 }],
    ['complex change', { risk: 'Low', effort: 4 }],
    ['no overview', { risk: 'Low', effort: undefined }],
  ])('looks for no newcomer on a %s', async (_label, overrides) => {
    folderAuthors('nueva')
    firstPullRequests(['nueva', '2026-11-01T09:00:00Z'])

    expect((await suggestReviewers(buildContext(overrides), { logger })).learner).toBeNull()
    expect(findFirstPullRequestDates).not.toHaveBeenCalled()
  })

  it('still suggests the expert when the newcomers cannot be looked up', async () => {
    findFirstPullRequestDates.mockRejectedValue(new Error('secondary rate limit'))

    expect(await suggestReviewers(buildContext(), { logger })).toEqual({ expert: 'ana', learner: null })
    expect(logger.warn).toHaveBeenCalledWith(
      '[review] Could not look for newcomers in acme-io/app: secondary rate limit'
    )
  })

  it('suggests nobody when there is no expert and no newcomer', async () => {
    listPathAuthors.mockResolvedValue([])

    expect(await suggestReviewers(buildContext(), { logger })).toBeNull()
    expect(canPushToRepository).not.toHaveBeenCalled()
    expect(countReviewsSince).not.toHaveBeenCalled()
  })

  it('returns null and logs when GitHub fails, so the review goes on', async () => {
    listPullRequestReviews.mockRejectedValue(new Error('boom'))

    expect(await suggestReviewers(buildContext(), { logger })).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      '[review] Could not suggest reviewers for acme-io/app#7:',
      expect.any(Error)
    )
  })
})
