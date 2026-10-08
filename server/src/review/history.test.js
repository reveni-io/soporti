import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListPullRequestReviews = vi.fn()
const mockListReviewThreads = vi.fn()
const mockListIssueComments = vi.fn()
const mockCompareCommits = vi.fn()

vi.mock('../github/client.js', () => ({
  listPullRequestReviews: mockListPullRequestReviews,
  listReviewThreads: mockListReviewThreads,
  listIssueComments: mockListIssueComments,
  compareCommits: mockCompareCommits,
}))

const { loadReviewHistory } = await import('./history.js')

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

const PR_FILES = [{ filename: 'src/checkout.js' }, { filename: 'src/cart.js' }]

function request(overrides = {}) {
  return {
    repoFullName: 'acme-io/app',
    prNumber: 7,
    headSha: 'head9999',
    reviewerLogin: 'soporti-bot',
    files: PR_FILES,
    ...overrides,
  }
}

function review(login, overrides = {}) {
  return { user: { login }, state: 'COMMENTED', body: '', commit_id: 'old1111', ...overrides }
}

function thread(authors, overrides = {}) {
  return {
    isResolved: false,
    isOutdated: false,
    path: 'src/checkout.js',
    line: 11,
    comments: authors.map((author, i) => ({ author, body: `comment ${i} by ${author}` })),
    ...overrides,
  }
}

function setup({ reviews = [], threads = [], comments = [], comparison = { status: 'ahead', files: [] } } = {}) {
  mockListPullRequestReviews.mockResolvedValue(reviews)
  mockListReviewThreads.mockResolvedValue(threads)
  mockListIssueComments.mockResolvedValue(comments)
  mockCompareCommits.mockResolvedValue(comparison)
}

describe('loadReviewHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('takes the commit of the reviewer latest submitted review as the last reviewed sha', async () => {
    setup({
      reviews: [
        review('soporti-bot', { commit_id: 'first111', body: 'first summary' }),
        review('alice', { commit_id: 'human222', body: 'looks fine' }),
        review('soporti-bot', { commit_id: 'second33', body: 'second summary' }),
        review('soporti-bot', { commit_id: 'draft444', state: 'PENDING' }),
      ],
    })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.lastReviewedSha).toBe('second33')
    expect(history.ownReviews).toEqual([
      { commitId: 'first111', body: 'first summary' },
      { commitId: 'second33', body: 'second summary' },
    ])
  })

  it('matches the reviewer login case-insensitively and ignoring the bot suffix', async () => {
    setup({ reviews: [review('Soporti-Bot[bot]', { commit_id: 'app11111' })], threads: [thread(['soporti-bot'])] })

    const history = await loadReviewHistory(request({ reviewerLogin: 'soporti-bot[bot]' }), { logger: silentLogger })

    expect(history.lastReviewedSha).toBe('app11111')
    expect(history.ownThreads).toHaveLength(1)
  })

  it('splits threads by who opened them, keeping the replies of open threads and only the root of resolved ones', async () => {
    setup({
      reviews: [review('soporti-bot')],
      threads: [
        thread(['soporti-bot', 'dev'], { isResolved: true }),
        thread(['alice', 'dev'], { path: 'src/cart.js', line: 3, isOutdated: true }),
        thread([]),
      ],
    })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.ownThreads).toEqual([
      {
        isResolved: true,
        isOutdated: false,
        path: 'src/checkout.js',
        line: 11,
        comments: [{ author: 'soporti-bot', body: 'comment 0 by soporti-bot' }],
      },
    ])
    expect(history.humanThreads).toEqual([
      {
        isResolved: false,
        isOutdated: true,
        path: 'src/cart.js',
        line: 3,
        comments: [
          { author: 'alice', body: 'comment 0 by alice' },
          { author: 'dev', body: 'comment 1 by dev' },
        ],
      },
    ])
  })

  it('keeps the root comment and the latest replies of a long thread', async () => {
    const authors = ['soporti-bot', ...Array.from({ length: 14 }, (_, i) => `dev${i}`)]
    setup({ threads: [thread(authors)] })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    const kept = history.ownThreads[0].comments.map(comment => comment.author)
    expect(kept).toHaveLength(10)
    expect(kept[0]).toBe('soporti-bot')
    expect(kept.at(-1)).toBe('dev13')
    expect(kept).not.toContain('dev4')
  })

  it('collects human review bodies and the PR conversation, leaving out the reviewer own comments', async () => {
    setup({
      reviews: [
        review('alice', { state: 'CHANGES_REQUESTED', body: 'Please add tests.' }),
        review('bob', { state: 'APPROVED', body: '   ' }),
      ],
      comments: [
        { user: { login: 'dev' }, body: 'Pushed the fix.' },
        { user: { login: 'soporti-bot' }, body: '⚠️ Soporti could not complete the review' },
      ],
    })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.humanReviews).toEqual([{ author: 'alice', state: 'CHANGES_REQUESTED', body: 'Please add tests.' }])
    expect(history.conversation).toEqual([{ author: 'dev', body: 'Pushed the fix.' }])
  })

  it('caps long comments and review bodies', async () => {
    setup({
      reviews: [review('alice', { body: 'r'.repeat(5000) })],
      comments: [{ user: { login: 'dev' }, body: 'c'.repeat(5000) }],
    })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.humanReviews[0].body).toHaveLength(3001)
    expect(history.humanReviews[0].body.endsWith('…')).toBe(true)
    expect(history.conversation[0].body).toHaveLength(1001)
  })

  it('caps the number of conversation comments to the most recent ones', async () => {
    setup({ comments: Array.from({ length: 25 }, (_, i) => ({ user: { login: 'dev' }, body: `c${i}` })) })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.conversation).toHaveLength(20)
    expect(history.conversation[0].body).toBe('c5')
  })

  it('loads every PR file changed since the last review with its patch, however large', async () => {
    setup({
      reviews: [review('soporti-bot', { commit_id: 'old1111' })],
      comparison: {
        status: 'ahead',
        files: [
          { filename: 'src/checkout.js', additions: 2, deletions: 1, patch: '@@ -1 +1 @@' },
          { filename: 'src/cart.js', additions: 6000, deletions: 0, patch: '@@ -1 +1,6000 @@' },
          { filename: 'merged-from-main.js', additions: 1, deletions: 0, patch: '@@' },
        ],
      },
    })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(mockCompareCommits).toHaveBeenCalledTimes(1)
    expect(mockCompareCommits).toHaveBeenCalledWith('acme-io/app', 'old1111', 'head9999')
    expect(history.changes).toEqual({
      status: 'incremental',
      files: [
        { filename: 'src/checkout.js', additions: 2, deletions: 1, patch: '@@ -1 +1 @@' },
        { filename: 'src/cart.js', additions: 6000, deletions: 0, patch: '@@ -1 +1,6000 @@' },
      ],
    })
  })

  it('treats a review on the current head as an incremental review with no changes', async () => {
    setup({
      reviews: [review('soporti-bot', { commit_id: 'head9999' })],
      comparison: { status: 'identical', files: [] },
    })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.changes).toEqual({ status: 'incremental', files: [] })
  })

  it('reports a diverged history when the last reviewed commit is no longer an ancestor of the head', async () => {
    setup({
      reviews: [review('soporti-bot')],
      comparison: { status: 'diverged', files: [{ filename: 'src/cart.js' }] },
    })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.changes).toEqual({ status: 'diverged' })
  })

  it('keeps the history but marks the changes unavailable when the comparison fails', async () => {
    setup({ reviews: [review('soporti-bot', { body: 'summary' })] })
    mockCompareCommits.mockRejectedValue(new Error('No common ancestor'))

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.changes).toEqual({ status: 'unavailable' })
    expect(history.ownReviews).toHaveLength(1)
    expect(silentLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No common ancestor'))
  })

  it('skips the comparison on a first review', async () => {
    setup({ reviews: [review('alice', { body: 'hi' })] })

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history.lastReviewedSha).toBeNull()
    expect(history.changes).toBeNull()
    expect(mockCompareCommits).not.toHaveBeenCalled()
  })

  it('degrades to a first-time review when the history cannot be loaded', async () => {
    setup()
    mockListReviewThreads.mockRejectedValue(new Error('GraphQL rate limit'))

    const history = await loadReviewHistory(request(), { logger: silentLogger })

    expect(history).toBeNull()
    expect(silentLogger.warn).toHaveBeenCalledWith(expect.stringContaining('GraphQL rate limit'))
  })

  it('does not load anything when the reviewer login is unknown', async () => {
    setup()

    const history = await loadReviewHistory(request({ reviewerLogin: null }), { logger: silentLogger })

    expect(history).toBeNull()
    expect(mockListPullRequestReviews).not.toHaveBeenCalled()
  })
})
