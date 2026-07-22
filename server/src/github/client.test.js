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

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    constructor() {
      this.repos = { listForAuthenticatedUser: mockListForAuthenticatedUser }
      this.users = { getAuthenticated: mockGetAuthenticated }
      this.pulls = {
        get: mockPullsGet,
        listFiles: mockListFiles,
        createReview: mockCreateReview,
        listReviewComments: mockListReviewComments,
        createReplyForReviewComment: mockCreateReplyForReviewComment,
      }
      this.issues = { createComment: mockCreateComment, listComments: mockListComments }
      this.reactions = { createForIssue: mockCreateForIssue, deleteForIssue: mockDeleteForIssue }
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
  createReviewCommentReply,
  createIssueReaction,
  deleteIssueReaction,
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
