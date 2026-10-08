import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListForAuthenticatedUser = vi.fn()
const mockGetAuthenticated = vi.fn()
const mockPullsGet = vi.fn()
const mockListFiles = vi.fn()
const mockCreateReview = vi.fn()
const mockCreateComment = vi.fn()
const mockListComments = vi.fn()
const mockListReviewComments = vi.fn()
const mockCreateReplyForReviewComment = vi.fn()
const mockCreateForIssue = vi.fn()
const mockDeleteForIssue = vi.fn()
const mockCreateForIssueComment = vi.fn()
const mockCreateForPullRequestReviewComment = vi.fn()
const mockListReviews = vi.fn()
const mockGraphql = vi.fn()
const mockCompareCommitsWithBasehead = vi.fn()

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    constructor() {
      this.repos = {
        listForAuthenticatedUser: mockListForAuthenticatedUser,
        compareCommitsWithBasehead: mockCompareCommitsWithBasehead,
      }
      this.graphql = mockGraphql
      this.users = { getAuthenticated: mockGetAuthenticated }
      this.pulls = {
        get: mockPullsGet,
        listFiles: mockListFiles,
        createReview: mockCreateReview,
        listReviewComments: mockListReviewComments,
        listReviews: mockListReviews,
        createReplyForReviewComment: mockCreateReplyForReviewComment,
      }
      this.issues = { createComment: mockCreateComment, listComments: mockListComments }
      this.reactions = {
        createForIssue: mockCreateForIssue,
        deleteForIssue: mockDeleteForIssue,
        createForIssueComment: mockCreateForIssueComment,
        createForPullRequestReviewComment: mockCreateForPullRequestReviewComment,
      }
    }
  },
}))

const getGithubToken = vi.fn(async () => 'test-token')
vi.mock('./settings.js', () => ({ getGithubToken }))

const {
  listRepos,
  getAuthenticatedLogin,
  getPullRequest,
  listPullRequestFiles,
  createPullRequestReview,
  createIssueComment,
  listIssueComments,
  listReviewComments,
  listPullRequestReviews,
  listReviewThreads,
  compareCommits,
  createReviewCommentReply,
  createIssueReaction,
  deleteIssueReaction,
  createIssueCommentReaction,
  createReviewCommentReaction,
} = await import('./client.js')

describe('listRepos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted repo list', async () => {
    mockListForAuthenticatedUser.mockResolvedValue({
      data: [
        { full_name: 'org/app', description: 'Main app', language: 'JavaScript', default_branch: 'main' },
        { full_name: 'org/lib', description: null, language: 'TypeScript', default_branch: 'master' },
      ],
    })

    const repos = await listRepos()
    expect(repos).toEqual([
      { fullName: 'org/app', description: 'Main app', language: 'JavaScript', defaultBranch: 'main' },
      { fullName: 'org/lib', description: '', language: 'TypeScript', defaultBranch: 'master' },
    ])
  })

  it('paginates through multiple pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      full_name: `org/repo-${i}`,
      description: '',
      language: 'JS',
      default_branch: 'main',
    }))
    const page2 = Array.from({ length: 50 }, (_, i) => ({
      full_name: `org/repo-${100 + i}`,
      description: '',
      language: 'JS',
      default_branch: 'main',
    }))

    mockListForAuthenticatedUser.mockResolvedValueOnce({ data: page1 }).mockResolvedValueOnce({ data: page2 })

    const repos = await listRepos()
    expect(repos.length).toBe(150)
    expect(mockListForAuthenticatedUser).toHaveBeenCalledTimes(2)
  })

  it('handles empty repo list', async () => {
    mockListForAuthenticatedUser.mockResolvedValue({ data: [] })
    const repos = await listRepos()
    expect(repos).toEqual([])
  })
})

describe('getAuthenticatedLogin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the login of the token owner', async () => {
    mockGetAuthenticated.mockResolvedValue({ data: { login: 'soporti-bot' } })
    expect(await getAuthenticatedLogin()).toBe('soporti-bot')
  })
})

describe('getPullRequest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches the PR by owner/repo/number', async () => {
    mockPullsGet.mockResolvedValue({ data: { number: 7, state: 'open', head: { sha: 'abc' } } })

    const pr = await getPullRequest('acme-io/app', 7)

    expect(mockPullsGet).toHaveBeenCalledWith({ owner: 'acme-io', repo: 'app', pull_number: 7 })
    expect(pr).toEqual({ number: 7, state: 'open', head: { sha: 'abc' } })
  })
})

describe('listPullRequestFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches the PR files with owner/repo/number', async () => {
    mockListFiles.mockResolvedValue({
      data: [{ filename: 'a.js', status: 'modified', patch: '@@', additions: 1, deletions: 0 }],
    })

    const files = await listPullRequestFiles('acme-io/app', 7)

    expect(mockListFiles).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme-io', repo: 'app', pull_number: 7, per_page: 100, page: 1 })
    )
    expect(files).toEqual([{ filename: 'a.js', status: 'modified', patch: '@@', additions: 1, deletions: 0 }])
  })

  it('paginates through multiple pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}.js` }))
    const page2 = [{ filename: 'last.js' }]
    mockListFiles.mockResolvedValueOnce({ data: page1 }).mockResolvedValueOnce({ data: page2 })

    const files = await listPullRequestFiles('acme-io/app', 7)

    expect(files.length).toBe(101)
    expect(mockListFiles).toHaveBeenCalledTimes(2)
  })
})

describe('createPullRequestReview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits the review with body, event and comments', async () => {
    mockCreateReview.mockResolvedValue({ data: { id: 1 } })

    await createPullRequestReview('acme-io/app', 7, {
      commitId: 'deadbeef',
      body: 'Summary',
      event: 'COMMENT',
      comments: [{ path: 'a.js', line: 3, side: 'RIGHT', body: 'careful here' }],
    })

    expect(mockCreateReview).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      pull_number: 7,
      commit_id: 'deadbeef',
      body: 'Summary',
      event: 'COMMENT',
      comments: [{ path: 'a.js', line: 3, side: 'RIGHT', body: 'careful here' }],
    })
  })

  it('omits the comments key when there are none', async () => {
    mockCreateReview.mockResolvedValue({ data: { id: 1 } })

    await createPullRequestReview('acme-io/app', 7, { commitId: 'sha', body: 'LGTM', event: 'APPROVE' })

    expect(mockCreateReview).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      pull_number: 7,
      commit_id: 'sha',
      body: 'LGTM',
      event: 'APPROVE',
    })
  })
})

describe('createIssueComment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts a comment on the PR conversation', async () => {
    mockCreateComment.mockResolvedValue({ data: { id: 2 } })

    await createIssueComment('acme-io/app', 7, 'Could not complete the review.')

    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      issue_number: 7,
      body: 'Could not complete the review.',
    })
  })
})

describe('listIssueComments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches the PR conversation comments, paginated', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i }))
    mockListComments.mockResolvedValueOnce({ data: page1 }).mockResolvedValueOnce({ data: [{ id: 100 }] })

    const comments = await listIssueComments('acme-io/app', 7)

    expect(comments).toHaveLength(101)
    expect(mockListComments).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      issue_number: 7,
      per_page: 100,
      page: 1,
    })
  })
})

describe('listReviewComments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches the PR review comments, paginated', async () => {
    mockListReviewComments.mockResolvedValue({ data: [{ id: 200, in_reply_to_id: null }] })

    const comments = await listReviewComments('acme-io/app', 7)

    expect(comments).toEqual([{ id: 200, in_reply_to_id: null }])
    expect(mockListReviewComments).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      pull_number: 7,
      per_page: 100,
      page: 1,
    })
  })
})

describe('listPullRequestReviews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches every review of the PR across pages', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ id: i }))
    mockListReviews.mockResolvedValueOnce({ data: firstPage }).mockResolvedValueOnce({ data: [{ id: 100 }] })

    const reviews = await listPullRequestReviews('acme-io/app', 7)

    expect(reviews).toHaveLength(101)
    expect(mockListReviews).toHaveBeenCalledTimes(2)
    expect(mockListReviews).toHaveBeenLastCalledWith({
      owner: 'acme-io',
      repo: 'app',
      pull_number: 7,
      per_page: 100,
      page: 2,
    })
  })
})

describe('listReviewThreads', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns each thread with its resolution state, location and comments', async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              {
                isResolved: true,
                isOutdated: false,
                path: 'src/a.js',
                line: 12,
                originalLine: 10,
                comments: {
                  nodes: [
                    { author: { login: 'soporti-bot' }, body: '**[major]** bug' },
                    { author: { login: 'dev' }, body: 'fixed' },
                  ],
                },
              },
              {
                isResolved: false,
                isOutdated: true,
                path: 'src/b.js',
                line: null,
                originalLine: 4,
                comments: { nodes: [{ author: null, body: null }] },
              },
            ],
          },
        },
      },
    })

    const threads = await listReviewThreads('acme-io/app', 7)

    expect(mockGraphql).toHaveBeenCalledTimes(1)
    expect(mockGraphql).toHaveBeenCalledWith(expect.stringContaining('reviewThreads'), {
      owner: 'acme-io',
      repo: 'app',
      number: 7,
    })
    expect(threads).toEqual([
      {
        isResolved: true,
        isOutdated: false,
        path: 'src/a.js',
        line: 12,
        comments: [
          { author: 'soporti-bot', body: '**[major]** bug' },
          { author: 'dev', body: 'fixed' },
        ],
      },
      { isResolved: false, isOutdated: true, path: 'src/b.js', line: 4, comments: [{ author: '', body: '' }] },
    ])
  })

  it('returns no threads when the PR cannot be found', async () => {
    mockGraphql.mockResolvedValue({ repository: null })

    expect(await listReviewThreads('acme-io/app', 7)).toEqual([])
  })
})

describe('compareCommits', () => {
  beforeEach(() => vi.clearAllMocks())

  it('compares the two commits and returns the status and the changed files', async () => {
    mockCompareCommitsWithBasehead.mockResolvedValue({
      data: {
        status: 'ahead',
        files: [{ filename: 'src/a.js', patch: '@@' }],
        commits: [],
        merge_base_commit: { sha: 'base000' },
      },
    })

    const comparison = await compareCommits('acme-io/app', 'aaa111', 'bbb222')

    expect(comparison).toEqual({
      status: 'ahead',
      files: [{ filename: 'src/a.js', patch: '@@' }],
      mergeBaseSha: 'base000',
    })
    expect(mockCompareCommitsWithBasehead).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      basehead: 'aaa111...bbb222',
    })
  })

  it('returns no files when the comparison lists none', async () => {
    mockCompareCommitsWithBasehead.mockResolvedValue({ data: { status: 'identical' } })

    expect(await compareCommits('acme-io/app', 'aaa111', 'aaa111')).toEqual({
      status: 'identical',
      files: [],
      mergeBaseSha: null,
    })
  })
})

describe('createIssueReaction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds the reaction to the PR and returns it', async () => {
    mockCreateForIssue.mockResolvedValue({ data: { id: 9001, content: 'eyes' } })

    const reaction = await createIssueReaction('acme-io/app', 7, 'eyes')

    expect(reaction).toEqual({ id: 9001, content: 'eyes' })
    expect(mockCreateForIssue).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      issue_number: 7,
      content: 'eyes',
    })
  })
})

describe('deleteIssueReaction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes the reaction from the PR', async () => {
    mockDeleteForIssue.mockResolvedValue({})

    await deleteIssueReaction('acme-io/app', 7, 9001)

    expect(mockDeleteForIssue).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      issue_number: 7,
      reaction_id: 9001,
    })
  })
})

describe('createIssueCommentReaction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds the reaction to a PR conversation comment and returns it', async () => {
    mockCreateForIssueComment.mockResolvedValue({ data: { id: 31, content: 'eyes' } })

    const reaction = await createIssueCommentReaction('acme-io/app', 300, 'eyes')

    expect(reaction).toEqual({ id: 31, content: 'eyes' })
    expect(mockCreateForIssueComment).toHaveBeenCalledTimes(1)
    expect(mockCreateForIssueComment).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      comment_id: 300,
      content: 'eyes',
    })
  })
})

describe('createReviewCommentReaction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds the reaction to a review thread comment and returns it', async () => {
    mockCreateForPullRequestReviewComment.mockResolvedValue({ data: { id: 32, content: 'eyes' } })

    const reaction = await createReviewCommentReaction('acme-io/app', 400, 'eyes')

    expect(reaction).toEqual({ id: 32, content: 'eyes' })
    expect(mockCreateForPullRequestReviewComment).toHaveBeenCalledTimes(1)
    expect(mockCreateForPullRequestReviewComment).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      comment_id: 400,
      content: 'eyes',
    })
  })
})

describe('createReviewCommentReply', () => {
  beforeEach(() => vi.clearAllMocks())

  it('replies inside the review thread of the given comment', async () => {
    mockCreateReplyForReviewComment.mockResolvedValue({ data: { id: 300 } })

    const reply = await createReviewCommentReply('acme-io/app', 7, 200, 'La HU dice X.')

    expect(reply).toEqual({ id: 300 })
    expect(mockCreateReplyForReviewComment).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      pull_number: 7,
      comment_id: 200,
      body: 'La HU dice X.',
    })
  })
})
