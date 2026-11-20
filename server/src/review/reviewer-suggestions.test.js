import { describe, it, expect, vi, beforeEach } from 'vitest'

const getReviewerSuggestions = vi.fn()
vi.mock('../github/settings.js', () => ({ getReviewerSuggestions }))

const listPullRequestReviews = vi.fn()
const listPathAuthors = vi.fn()
const canPushToRepository = vi.fn()
const countReviewsSince = vi.fn()
vi.mock('../github/client.js', () => ({
  listPullRequestReviews,
  listPathAuthors,
  canPushToRepository,
  countReviewsSince,
}))

const { suggestReviewers } = await import('./reviewer-suggestions.js')

const logger = { error: vi.fn() }

function buildContext(overrides = {}) {
  return {
    trigger: {
      repoFullName: 'acme-io/app',
      prNumber: 7,
      dedupeKey: 'acme-io/app#7',
      authorLogin: 'author',
      baseRef: 'main',
    },
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
  vi.useRealTimers()
  getReviewerSuggestions.mockResolvedValue({ enabled: true, newcomers: [] })
  listPullRequestReviews.mockResolvedValue([])
  listPathAuthors.mockResolvedValue([
    { path: 'src/a.js', authors: ['ana', 'ana', 'luis'] },
    { path: 'src/b.js', authors: ['ana', 'luis', 'marta'] },
  ])
  canPushToRepository.mockResolvedValue(true)
  loads({})
})

describe('suggestReviewers', () => {
  it('does nothing while the switch is off', async () => {
    getReviewerSuggestions.mockResolvedValue({ enabled: false, newcomers: ['nueva'] })

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
    vi.useFakeTimers({ now: new Date('2026-11-20T10:00:00Z'), toFake: ['Date'] })

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
    expect(listPathAuthors).not.toHaveBeenCalled()
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
    expect(listPathAuthors).not.toHaveBeenCalled()
  })

  it('suggests the newcomer with fewer recent reviews on a PR that is good to learn from', async () => {
    getReviewerSuggestions.mockResolvedValue({ enabled: true, newcomers: ['nueva', 'nuevo', 'author'] })
    loads({ nueva: 3, nuevo: 1 })

    expect(await suggestReviewers(buildContext({ risk: 'Medium', effort: 3 }), { logger })).toEqual({
      expert: 'ana',
      learner: 'nuevo',
    })
  })

  it('suggests a newcomer even when the PR already has a reviewer', async () => {
    getReviewerSuggestions.mockResolvedValue({ enabled: true, newcomers: ['nueva'] })
    listPullRequestReviews.mockResolvedValue([{ user: { login: 'marta' } }])

    expect(await suggestReviewers(buildContext(), { logger })).toEqual({ expert: null, learner: 'nueva' })
  })

  it('does not suggest the expert again as the newcomer', async () => {
    getReviewerSuggestions.mockResolvedValue({ enabled: true, newcomers: ['ANA'] })
    listPathAuthors.mockResolvedValue([{ path: 'src/a.js', authors: ['ana'] }])

    expect(await suggestReviewers(buildContext(), { logger })).toEqual({ expert: 'ana', learner: null })
  })

  it.each([
    ['high risk', { risk: 'High', effort: 2 }],
    ['unknown risk', { risk: 'Unknown', effort: 2 }],
    ['trivial change', { risk: 'Low', effort: 1 }],
    ['complex change', { risk: 'Low', effort: 4 }],
    ['no overview', { risk: 'Low', effort: undefined }],
  ])('suggests no newcomer on a %s', async (_label, overrides) => {
    getReviewerSuggestions.mockResolvedValue({ enabled: true, newcomers: ['nueva'] })

    expect((await suggestReviewers(buildContext(overrides), { logger })).learner).toBeNull()
  })

  it('skips newcomers that are not valid logins', async () => {
    getReviewerSuggestions.mockResolvedValue({ enabled: true, newcomers: ['bad login'] })
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
