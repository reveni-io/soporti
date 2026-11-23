import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@openai/agents', () => ({ tool: config => config }))

const listPullRequestReviews = vi.fn()
const listPathReviewers = vi.fn()
const listCollaborators = vi.fn()
const canPushToRepository = vi.fn()
const countReviewsSince = vi.fn()
vi.mock('../github/client.js', () => ({
  canPushToRepository,
  countReviewsSince,
  listCollaborators,
  listPathReviewers,
  listPullRequestReviews,
}))

const { buildReviewerSuggestion, pickReviewer } = await import('./reviewer-suggestions.js')

const logger = { error: vi.fn(), warn: vi.fn() }
const NOW = new Date('2026-11-20T10:00:00Z')

const PATH_REVIEWS = [
  {
    path: 'src/a.js',
    pullRequests: [
      { number: 1, reviewers: ['ana', 'luis'] },
      { number: 2, reviewers: ['ana'] },
    ],
  },
  {
    path: 'src/b.js',
    pullRequests: [
      { number: 2, reviewers: ['ana', 'marta'] },
      { number: 3, reviewers: ['ana', 'otherteam', 'dependabot[bot]'] },
    ],
  },
]

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
      { filename: 'package-lock.json', changes: 900, generated: true },
    ],
    reviewerLogin: 'soporti-bot',
    ...overrides,
  }
}

function reviewsInLastMonth(counts) {
  countReviewsSince.mockImplementation(async (_owner, logins) => new Map(logins.map(login => [login, counts[login]])))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  listPullRequestReviews.mockResolvedValue([])
  listPathReviewers.mockResolvedValue(PATH_REVIEWS)
  listCollaborators.mockResolvedValue(['ana', 'luis', 'marta'])
  canPushToRepository.mockResolvedValue(true)
  reviewsInLastMonth({ ana: 8, luis: 1, marta: 3 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pickReviewer', () => {
  it('picks the team member with the fewest recent reviews for how many PRs on these files they reviewed', async () => {
    const result = await pickReviewer(buildContext(), null)

    expect(result).toEqual({ suggestion: { login: 'luis', knowledge: 1, load: 1 } })
    expect(listPathReviewers).toHaveBeenCalledWith('acme-io/app', 'main', ['src/a.js', 'src/b.js'], {
      since: '2025-11-20T10:00:00.000Z',
    })
    expect(countReviewsSince).toHaveBeenCalledWith('acme-io', ['ana', 'luis', 'marta'], '2026-10-21')
  })

  it('weighs the load by knowledge, so the one who knows the files best still gets their share', async () => {
    reviewsInLastMonth({ ana: 2, luis: 1, marta: 3 })

    expect((await pickReviewer(buildContext(), null)).suggestion).toEqual({ login: 'ana', knowledge: 3, load: 2 })
  })

  it('takes the team from the people the author works with when the REVIEW.md names none', async () => {
    await pickReviewer(buildContext(), null)

    expect(listCollaborators).toHaveBeenCalledWith('acme-io', 'author', '2026-05-24')
    expect(canPushToRepository.mock.calls.map(([, login]) => login)).toEqual(['ana', 'luis', 'marta'])
  })

  it('takes the team the REVIEW.md names, in any case and with or without @', async () => {
    reviewsInLastMonth({ marta: 3, otherteam: 5 })

    const result = await pickReviewer(buildContext(), [' @Marta ', 'OtherTeam'])

    expect(listCollaborators).not.toHaveBeenCalled()
    expect(canPushToRepository.mock.calls.map(([, login]) => login)).toEqual(['marta', 'otherteam'])
    expect(result.suggestion.login).toBe('marta')
  })

  it('leaves out the author, Soporti, people already asked to review and those who cannot push', async () => {
    listPathReviewers.mockResolvedValue([
      { path: 'src/a.js', pullRequests: [{ number: 1, reviewers: ['author', 'soporti-bot', 'luis', 'ana'] }] },
    ])
    listCollaborators.mockResolvedValue(['author', 'soporti-bot', 'luis', 'ana'])
    listPullRequestReviews.mockResolvedValue([{ user: { login: 'author' } }])
    canPushToRepository.mockImplementation(async (_repo, login) => login !== 'luis')

    expect((await pickReviewer(buildContext(), null)).suggestion.login).toBe('ana')
  })

  it('suggests nobody when someone is already reviewing', async () => {
    const withReviewer = buildContext({ pr: { requested_reviewers: [{ login: 'luis' }], requested_teams: [] } })
    const withTeam = buildContext({ pr: { requested_reviewers: [], requested_teams: [{ slug: 'backend' }] } })

    expect(await pickReviewer(withReviewer, null)).toEqual({ reason: expect.stringMatching(/already reviewing/) })
    expect(await pickReviewer(withTeam, null)).toEqual({ reason: expect.stringMatching(/already reviewing/) })
    expect(listPathReviewers).not.toHaveBeenCalled()
  })

  it('suggests nobody when no one in the team reviewed these files', async () => {
    listCollaborators.mockResolvedValue(['someone-else'])

    expect(await pickReviewer(buildContext(), null)).toEqual({
      reason: expect.stringMatching(/^Nobody in the team reviewed/),
    })
    expect(countReviewsSince).not.toHaveBeenCalled()
  })
})

describe('buildReviewerSuggestion', () => {
  it('gives the overview a suggest_reviewer tool that keeps its pick for the walkthrough', async () => {
    const suggestion = buildReviewerSuggestion(buildContext(), { logger })

    expect(suggestion.tool.name).toBe('suggest_reviewer')
    expect(suggestion.tool.description).toContain('Use it only when the REVIEW.md asks for a reviewer suggestion.')
    expect(suggestion.read()).toBeNull()

    const answer = await suggestion.tool.execute({ team: null })

    expect(answer).toBe(
      'Suggested @luis: reviewed 1 pull request(s) that changed these files, and 1 pull request(s) in the last 30 days.'
    )
    expect(suggestion.read()).toEqual({ login: 'luis', knowledge: 1, load: 1 })
  })

  it('says why there is no one to suggest, and keeps nothing', async () => {
    listPullRequestReviews.mockResolvedValue([{ user: { login: 'marta' } }])
    const suggestion = buildReviewerSuggestion(buildContext(), { logger })

    expect(await suggestion.tool.execute({ team: null })).toMatch(/already reviewing/)
    expect(suggestion.read()).toBeNull()
  })

  it('logs a failure and tells the agent it could not suggest anyone', async () => {
    listPathReviewers.mockRejectedValue(new Error('GitHub is down'))
    const suggestion = buildReviewerSuggestion(buildContext(), { logger })

    expect(await suggestion.tool.execute({ team: null })).toBe('Could not suggest a reviewer.')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(suggestion.read()).toBeNull()
  })
})
