import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListForAuthenticatedUser = vi.fn()
const mockGetAuthenticated = vi.fn()
const mockPullsGet = vi.fn()
const mockPullsCreate = vi.fn()
const mockListFiles = vi.fn()
const mockCreateReview = vi.fn()
const mockCreateComment = vi.fn()
const mockUpdateComment = vi.fn()
const mockListComments = vi.fn()
const mockListReviewComments = vi.fn()
const mockUpdateReviewComment = vi.fn()
const mockCreateReplyForReviewComment = vi.fn()
const mockCreateForIssue = vi.fn()
const mockDeleteForIssue = vi.fn()
const mockCreateForIssueComment = vi.fn()
const mockCreateForPullRequestReviewComment = vi.fn()
const mockListReviews = vi.fn()
const mockGraphql = vi.fn()
const mockCompareCommitsWithBasehead = vi.fn()
const mockListForRef = vi.fn()
const mockGetCombinedStatusForRef = vi.fn()
const mockReposGet = vi.fn()
const mockGetCollaboratorPermissionLevel = vi.fn()

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    constructor() {
      this.repos = {
        listForAuthenticatedUser: mockListForAuthenticatedUser,
        compareCommitsWithBasehead: mockCompareCommitsWithBasehead,
        getCombinedStatusForRef: mockGetCombinedStatusForRef,
        get: mockReposGet,
        getCollaboratorPermissionLevel: mockGetCollaboratorPermissionLevel,
      }
      this.checks = { listForRef: mockListForRef }
      this.graphql = mockGraphql
      this.users = { getAuthenticated: mockGetAuthenticated }
      this.pulls = {
        get: mockPullsGet,
        create: mockPullsCreate,
        listFiles: mockListFiles,
        createReview: mockCreateReview,
        listReviewComments: mockListReviewComments,
        updateReviewComment: mockUpdateReviewComment,
        listReviews: mockListReviews,
        createReplyForReviewComment: mockCreateReplyForReviewComment,
      }
      this.issues = {
        createComment: mockCreateComment,
        updateComment: mockUpdateComment,
        listComments: mockListComments,
      }
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
  getAuthenticatedUser,
  getPullRequest,
  createPullRequest,
  listPullRequestFiles,
  createPullRequestReview,
  createIssueComment,
  updateIssueComment,
  listIssueComments,
  listReviewComments,
  listPullRequestReviews,
  listReviewThreads,
  updateReviewComment,
  resolveReviewThread,
  compareCommits,
  listCheckRuns,
  listCommitStatuses,
  createReviewCommentReply,
  createIssueReaction,
  deleteIssueReaction,
  createIssueCommentReaction,
  createReviewCommentReaction,
  listPathAuthors,
  countReviewsSince,
  canPushToRepository,
  findFirstPullRequestDates,
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

describe('getAuthenticatedUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the login, id and name of the token owner', async () => {
    mockGetAuthenticated.mockResolvedValue({ data: { login: 'soporti-bot', id: 42, name: 'Soporti Bot', email: 'x' } })

    expect(await getAuthenticatedUser()).toEqual({ login: 'soporti-bot', id: 42, name: 'Soporti Bot' })
  })

  it('returns a null name when the account has none', async () => {
    mockGetAuthenticated.mockResolvedValue({ data: { login: 'soporti-bot', id: 42 } })

    expect(await getAuthenticatedUser()).toEqual({ login: 'soporti-bot', id: 42, name: null })
  })
})

describe('createPullRequest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('always opens the pull request as a draft and returns its link', async () => {
    mockPullsCreate.mockResolvedValue({
      data: { number: 12, html_url: 'https://github.com/acme-io/app/pull/12', title: 'Fix typo', draft: true, id: 9 },
    })

    const pr = await createPullRequest('acme-io/app', {
      title: 'Fix typo',
      body: 'Body',
      head: 'soporti/fix-typo-abc123',
      base: 'main',
    })

    expect(mockPullsCreate).toHaveBeenCalledTimes(1)
    expect(mockPullsCreate).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      title: 'Fix typo',
      body: 'Body',
      head: 'soporti/fix-typo-abc123',
      base: 'main',
      draft: true,
    })
    expect(pr).toEqual({ number: 12, url: 'https://github.com/acme-io/app/pull/12', title: 'Fix typo', draft: true })
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

describe('updateIssueComment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('edits an existing PR conversation comment in place', async () => {
    mockUpdateComment.mockResolvedValue({ data: { id: 55, body: 'Updated walkthrough' } })

    const comment = await updateIssueComment('acme-io/app', 55, 'Updated walkthrough')

    expect(comment).toEqual({ id: 55, body: 'Updated walkthrough' })
    expect(mockUpdateComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateComment).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      comment_id: 55,
      body: 'Updated walkthrough',
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
                id: 'PRRT_a',
                isResolved: true,
                isOutdated: false,
                path: 'src/a.js',
                line: 12,
                originalLine: 10,
                comments: {
                  nodes: [
                    { fullDatabaseId: '4224005529', author: { login: 'soporti-bot' }, body: '**[major]** bug' },
                    { fullDatabaseId: '4224005530', author: { login: 'dev' }, body: 'fixed' },
                  ],
                },
              },
              {
                id: 'PRRT_b',
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
        id: 'PRRT_a',
        isResolved: true,
        isOutdated: false,
        path: 'src/a.js',
        line: 12,
        comments: [
          { databaseId: '4224005529', author: 'soporti-bot', body: '**[major]** bug' },
          { databaseId: '4224005530', author: 'dev', body: 'fixed' },
        ],
      },
      {
        id: 'PRRT_b',
        isResolved: false,
        isOutdated: true,
        path: 'src/b.js',
        line: 4,
        comments: [{ databaseId: null, author: '', body: '' }],
      },
    ])
  })

  it('returns no threads when the PR cannot be found', async () => {
    mockGraphql.mockResolvedValue({ repository: null })

    expect(await listReviewThreads('acme-io/app', 7)).toEqual([])
  })
})

describe('updateReviewComment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('edits an inline review comment in place, by its 64-bit id', async () => {
    mockUpdateReviewComment.mockResolvedValue({ data: { id: 4224005529, body: 'Edited finding' } })

    const comment = await updateReviewComment('acme-io/app', '4224005529', 'Edited finding')

    expect(comment).toEqual({ id: 4224005529, body: 'Edited finding' })
    expect(mockUpdateReviewComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateReviewComment).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      comment_id: '4224005529',
      body: 'Edited finding',
    })
  })
})

describe('resolveReviewThread', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves a review thread by its node id', async () => {
    mockGraphql.mockResolvedValue({ resolveReviewThread: { thread: { id: 'PRRT_a' } } })

    await resolveReviewThread('PRRT_a')

    expect(mockGraphql).toHaveBeenCalledTimes(1)
    expect(mockGraphql).toHaveBeenCalledWith(expect.stringContaining('resolveReviewThread(input: { threadId'), {
      threadId: 'PRRT_a',
    })
  })

  it('surfaces a mutation failure to the caller', async () => {
    mockGraphql.mockRejectedValue(new Error('Resource not accessible by integration'))

    await expect(resolveReviewThread('PRRT_a')).rejects.toThrow('Resource not accessible by integration')
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

describe('listCheckRuns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the check runs of the ref with their output', async () => {
    mockListForRef.mockResolvedValue({
      data: {
        total_count: 2,
        check_runs: [
          {
            name: 'lint',
            status: 'completed',
            conclusion: 'failure',
            output: { title: '2 problems', summary: 'src/a.js:3 no-unused-vars' },
          },
          { name: 'test', status: 'in_progress', conclusion: null, output: {} },
        ],
      },
    })

    const runs = await listCheckRuns('acme-io/app', 'bbb222')

    expect(runs).toEqual([
      {
        name: 'lint',
        status: 'completed',
        conclusion: 'failure',
        title: '2 problems',
        summary: 'src/a.js:3 no-unused-vars',
      },
      { name: 'test', status: 'in_progress', conclusion: null, title: '', summary: '' },
    ])
    expect(mockListForRef).toHaveBeenCalledTimes(1)
    expect(mockListForRef).toHaveBeenCalledWith({ owner: 'acme-io', repo: 'app', ref: 'bbb222', per_page: 100 })
  })

  it('returns no runs when the response lists none', async () => {
    mockListForRef.mockResolvedValue({ data: { total_count: 0 } })

    expect(await listCheckRuns('acme-io/app', 'bbb222')).toEqual([])
  })
})

describe('listCommitStatuses', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the latest status of each context on the ref', async () => {
    mockGetCombinedStatusForRef.mockResolvedValue({
      data: {
        state: 'failure',
        statuses: [
          { context: 'ci/circleci', state: 'failure', description: 'Your tests failed' },
          { context: 'deploy/preview', state: 'pending', description: null },
        ],
      },
    })

    const statuses = await listCommitStatuses('acme-io/app', 'bbb222')

    expect(statuses).toEqual([
      { context: 'ci/circleci', state: 'failure', description: 'Your tests failed' },
      { context: 'deploy/preview', state: 'pending', description: '' },
    ])
    expect(mockGetCombinedStatusForRef).toHaveBeenCalledTimes(1)
    expect(mockGetCombinedStatusForRef).toHaveBeenCalledWith({
      owner: 'acme-io',
      repo: 'app',
      ref: 'bbb222',
      per_page: 100,
    })
  })

  it('returns no statuses when the response lists none', async () => {
    mockGetCombinedStatusForRef.mockResolvedValue({ data: { state: 'pending' } })

    expect(await listCommitStatuses('acme-io/app', 'bbb222')).toEqual([])
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

describe('getRepository', () => {
  it('returns the full name of a repo the token can read', async () => {
    mockReposGet.mockResolvedValue({ data: { full_name: 'acme/docs', private: true } })
    const { getRepository } = await import('./client.js')

    expect(await getRepository('acme/docs')).toEqual({ fullName: 'acme/docs' })
    expect(mockReposGet).toHaveBeenCalledWith({ owner: 'acme', repo: 'docs' })
  })
})

describe('listPathAuthors', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the commit authors of every path in one query, skipping commits without a GitHub user', async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        object: {
          f0: { nodes: [{ author: { user: { login: 'ana' } } }, { author: { user: null } }] },
          f1: { nodes: [] },
        },
      },
    })

    const result = await listPathAuthors('acme-io/app', 'main', ['src/a.js', 'src/new.js'])

    expect(result).toEqual([
      { path: 'src/a.js', authors: ['ana'] },
      { path: 'src/new.js', authors: [] },
    ])
    const [query, variables] = mockGraphql.mock.calls[0]
    expect(query).toContain('f1: history(first: 20, path: $p1)')
    expect(variables).toEqual({ owner: 'acme-io', repo: 'app', ref: 'main', p0: 'src/a.js', p1: 'src/new.js' })
  })

  it('reads more commits per path when asked', async () => {
    mockGraphql.mockResolvedValue({ repository: { object: { f0: { nodes: [] } } } })

    await listPathAuthors('acme-io/app', 'main', ['apps/returns'], { limit: 50 })

    expect(mockGraphql.mock.calls[0][0]).toContain('f0: history(first: 50, path: $p0)')
  })

  it('returns no authors when the ref is missing', async () => {
    mockGraphql.mockResolvedValue({ repository: { object: null } })

    expect(await listPathAuthors('acme-io/app', 'gone', ['src/a.js'])).toEqual([{ path: 'src/a.js', authors: [] }])
  })

  it('does not query GitHub without paths', async () => {
    expect(await listPathAuthors('acme-io/app', 'main', [])).toEqual([])
    expect(mockGraphql).not.toHaveBeenCalled()
  })
})

describe('countReviewsSince', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts the PRs each person reviewed since the date in one query', async () => {
    mockGraphql.mockResolvedValue({ r0: { issueCount: 4 }, r1: null })

    const counts = await countReviewsSince('acme-io', ['ana', 'luis'], '2026-10-21')

    expect(counts).toEqual(
      new Map([
        ['ana', 4],
        ['luis', 0],
      ])
    )
    const [query, variables] = mockGraphql.mock.calls[0]
    expect(query).toContain('r1: search(query: $q1, type: ISSUE, first: 1) { issueCount }')
    expect(variables.q0).toBe('is:pr user:acme-io reviewed-by:ana -author:ana updated:>=2026-10-21')
  })

  it('does not query GitHub without people', async () => {
    expect(await countReviewsSince('acme-io', [], '2026-10-21')).toEqual(new Map())
    expect(mockGraphql).not.toHaveBeenCalled()
  })
})

describe('canPushToRepository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is true for admin and write access', async () => {
    mockGetCollaboratorPermissionLevel.mockResolvedValue({ data: { permission: 'write' } })

    expect(await canPushToRepository('acme-io/app', 'ana')).toBe(true)
    expect(mockGetCollaboratorPermissionLevel).toHaveBeenCalledWith({ owner: 'acme-io', repo: 'app', username: 'ana' })
  })

  it('is false for read access and for unknown people', async () => {
    mockGetCollaboratorPermissionLevel.mockResolvedValueOnce({ data: { permission: 'read' } })
    expect(await canPushToRepository('acme-io/app', 'ana')).toBe(false)

    mockGetCollaboratorPermissionLevel.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
    expect(await canPushToRepository('acme-io/app', 'ghost')).toBe(false)
  })

  it('rethrows other errors', async () => {
    mockGetCollaboratorPermissionLevel.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))

    await expect(canPushToRepository('acme-io/app', 'ana')).rejects.toThrow('Forbidden')
  })
})

describe('findFirstPullRequestDates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finds the oldest PR each person opened in the org, 50 people per query', async () => {
    const logins = Array.from({ length: 51 }, (_, index) => `dev${index}`)
    mockGraphql
      .mockResolvedValueOnce({ r0: { nodes: [{ createdAt: '2026-06-01T10:00:00Z' }] }, r1: { nodes: [] } })
      .mockResolvedValueOnce({ r0: null })

    const dates = await findFirstPullRequestDates('acme-io', logins)

    expect(dates.get('dev0')).toBe('2026-06-01T10:00:00Z')
    expect(dates.get('dev1')).toBeNull()
    expect(dates.get('dev50')).toBeNull()
    expect(dates.size).toBe(51)
    expect(mockGraphql).toHaveBeenCalledTimes(2)
    const [query, variables] = mockGraphql.mock.calls[0]
    expect(query).toContain('r49: search(query: $q49, type: ISSUE, first: 1)')
    expect(variables.q0).toBe('is:pr org:acme-io author:dev0 sort:created-asc')
    expect(mockGraphql.mock.calls[1][1]).toEqual({ q0: 'is:pr org:acme-io author:dev50 sort:created-asc' })
  })

  it('does not query GitHub without people', async () => {
    expect(await findFirstPullRequestDates('acme-io', [])).toEqual(new Map())
    expect(mockGraphql).not.toHaveBeenCalled()
  })
})
