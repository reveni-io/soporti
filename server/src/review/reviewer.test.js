import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPullRequest = vi.fn()
const mockListPullRequestFiles = vi.fn()
const mockCreatePullRequestReview = vi.fn()
const mockCreateIssueComment = vi.fn()
const mockCreateIssueReaction = vi.fn()
const mockDeleteIssueReaction = vi.fn()
const mockRunReviewerAgent = vi.fn()
const mockAcquire = vi.fn()
const mockRelease = vi.fn()

vi.mock('../github/client.js', () => ({
  getPullRequest: mockGetPullRequest,
  listPullRequestFiles: mockListPullRequestFiles,
  createPullRequestReview: mockCreatePullRequestReview,
  createIssueComment: mockCreateIssueComment,
  createIssueReaction: mockCreateIssueReaction,
  deleteIssueReaction: mockDeleteIssueReaction,
}))

vi.mock('./agent.js', () => ({
  runReviewerAgent: mockRunReviewerAgent,
}))

const mockFindFiles = vi.fn()
const mockFindFilesAt = vi.fn()
const mockAcquireWorktree = vi.fn()
const mockWorktreeRelease = vi.fn()
const mockShortcutConfigured = vi.fn()
const mockGetStory = vi.fn()

vi.mock('../repo-pool/index.js', () => ({
  pool: {
    acquire: (...args) => mockAcquire(...args),
    acquireWorktree: (...args) => mockAcquireWorktree(...args),
  },
  findFiles: (...args) => mockFindFiles(...args),
  findFilesAt: (...args) => mockFindFilesAt(...args),
}))

vi.mock('../shortcut/client.js', () => ({
  isConfigured: () => mockShortcutConfigured(),
  getStory: (...args) => mockGetStory(...args),
}))

vi.mock('../config.js', () => ({
  default: {
    review: { maxChangedLines: 100 },
  },
}))

// The empty-file verification stats files in the PR-head worktree; tests use
// fake paths, so the fs module is mocked (default: everything fails to stat).
const mockStat = vi.fn()
vi.mock('node:fs/promises', () => ({ stat: mockStat }))

const { runReview } = await import('./reviewer.js')

const PATCH = [
  '@@ -8,4 +10,5 @@ function checkout() {',
  ' const cart = getCart()',
  '-const total = sum(cart)',
  '+const total = sumItems(cart)',
  '+validate(total)',
  ' return total',
].join('\n')

function trigger() {
  return {
    kind: 'review_requested',
    repoFullName: 'acme-io/app',
    prNumber: 7,
    headSha: 'deadbeef',
    baseRef: 'main',
    title: 'Fix totals',
    body: 'desc',
    authorLogin: 'dev',
    draft: false,
    changedLines: 3,
    dedupeKey: 'acme-io/app#7@deadbeef',
  }
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

function prData(overrides = {}) {
  return {
    state: 'open',
    title: 'Fix totals',
    body: 'desc',
    draft: false,
    user: { login: 'dev' },
    head: { sha: 'deadbeef', ref: 'fix/totals' },
    base: { ref: 'main' },
    additions: 2,
    deletions: 1,
    ...overrides,
  }
}

function setupHappyPath({ verdict = 'comment', findings = [], pr = prData() } = {}) {
  mockGetPullRequest.mockResolvedValue(pr)
  mockListPullRequestFiles.mockResolvedValue([
    { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
  ])
  mockAcquire.mockResolvedValue({ localPath: '/tmp/x', release: mockRelease })
  mockAcquireWorktree.mockResolvedValue({ localPath: '/tmp/wt-pr-7', release: mockWorktreeRelease })
  mockFindFiles.mockResolvedValue({ totalCount: 0, items: [], truncated: false })
  mockFindFilesAt.mockResolvedValue({ totalCount: 0, items: [], truncated: false })
  mockShortcutConfigured.mockReturnValue(false)
  mockRunReviewerAgent.mockResolvedValue({ summary: 'Looks reasonable.', verdict, findings })
  mockCreatePullRequestReview.mockResolvedValue({ id: 1 })
  mockCreateIssueReaction.mockResolvedValue({ id: 9001, content: 'eyes' })
  mockDeleteIssueReaction.mockResolvedValue(undefined)
  mockStat.mockRejectedValue(new Error('ENOENT'))
}

describe('runReview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts a COMMENT review with anchored findings inline and the rest in the body', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [
        {
          path: 'src/checkout.js',
          line: 11,
          severity: 'major',
          axis: 'correctness',
          body: 'sumItems may throw on empty cart',
        },
        { path: 'src/checkout.js', line: 500, severity: 'minor', axis: 'standards', body: 'outside the diff' },
      ],
    })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    const [repo, prNumber, review] = mockCreatePullRequestReview.mock.calls[0]
    expect(repo).toBe('acme-io/app')
    expect(prNumber).toBe(7)
    expect(review.event).toBe('COMMENT')
    expect(review.commitId).toBe('deadbeef')
    expect(review.comments).toEqual([
      expect.objectContaining({
        path: 'src/checkout.js',
        line: 11,
        side: 'RIGHT',
        body: expect.stringContaining('sumItems may throw'),
      }),
    ])
    expect(review.body).toContain('Looks reasonable.')
    expect(review.body).toContain('outside the diff')
    expect(review.body).toContain('src/checkout.js')
    // Non-correctness findings carry their axis in the rendered tag.
    expect(review.body).toContain('standards')
  })

  it('posts an APPROVE review when the agent approves without blocking findings', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].event).toBe('APPROVE')
  })

  it('downgrades an approve to COMMENT when a critical or major finding exists', async () => {
    setupHappyPath({
      verdict: 'approve',
      findings: [{ path: 'src/checkout.js', line: 11, severity: 'major', body: 'bug' }],
    })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].event).toBe('COMMENT')
  })

  it('falls back to a body-only review when GitHub rejects the inline comments', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [{ path: 'src/checkout.js', line: 11, severity: 'major', body: 'sumItems may throw' }],
    })
    mockCreatePullRequestReview
      .mockRejectedValueOnce(Object.assign(new Error('Validation Failed'), { status: 422 }))
      .mockResolvedValueOnce({ id: 2 })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(2)
    const second = mockCreatePullRequestReview.mock.calls[1][2]
    expect(second.comments).toBeUndefined()
    expect(second.body).toContain('sumItems may throw')
  })

  it('never approves when some changed files were left out of the review', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'package-lock.json', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].event).toBe('COMMENT')
  })

  it('only retries body-only on a 422; other errors surface as a failure comment', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [{ path: 'src/checkout.js', line: 11, severity: 'major', body: 'sumItems may throw' }],
    })
    mockCreatePullRequestReview.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 503 }))
    mockCreateIssueComment.mockResolvedValue({ id: 3 })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueComment.mock.calls[0][2]).toMatch(/could not complete/i)
  })

  it('anchors the review to the freshest head when a push lands during file fetch', async () => {
    setupHappyPath()
    mockGetPullRequest
      .mockResolvedValueOnce(prData({ head: { sha: 'sha-a', ref: 'fix/totals' } }))
      .mockResolvedValueOnce(prData({ head: { sha: 'sha-b', ref: 'fix/totals' } }))

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].commitId).toBe('sha-b')
  })

  it('references the reviewed head sha (not the stale trigger sha) in the failure comment', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'newhead1', ref: 'fix/totals' } }) })
    mockListPullRequestFiles.mockRejectedValue(new Error('boom'))
    mockCreateIssueComment.mockResolvedValue({})

    await runReview(trigger(), { logger: silentLogger })

    const body = mockCreateIssueComment.mock.calls[0][2]
    expect(body).toContain('newhead')
    expect(body).not.toContain('deadbee')
  })

  it('passes the standards documents discovered in the checkout to the agent, deduplicated', async () => {
    setupHappyPath()
    mockFindFilesAt.mockImplementation(async (_rootPath, pattern) => {
      if (pattern === 'CLAUDE.md')
        return { totalCount: 1, items: [{ path: 'CLAUDE.md', name: 'CLAUDE.md' }], truncated: false }
      if (pattern === 'docs/adr/*.md')
        return { totalCount: 1, items: [{ path: 'docs/adr/0001-x.md', name: '0001-x.md' }], truncated: false }
      if (pattern === 'CONTEXT.md')
        return { totalCount: 1, items: [{ path: 'CLAUDE.md', name: 'CLAUDE.md' }], truncated: false }
      return { totalCount: 0, items: [], truncated: false }
    })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(
      expect.objectContaining({ standardsFiles: ['CLAUDE.md', 'docs/adr/0001-x.md'] })
    )
  })

  it('discovers agent skills as standards documents', async () => {
    setupHappyPath()
    mockFindFilesAt.mockImplementation(async (_rootPath, pattern) => {
      if (pattern === '.claude/skills/*.md')
        return {
          totalCount: 1,
          items: [{ path: '.claude/skills/django-migrations/SKILL.md', name: 'SKILL.md' }],
          truncated: false,
        }
      if (pattern === '.agents/skills/*.md')
        return {
          totalCount: 1,
          items: [{ path: '.agents/skills/tdd/SKILL.md', name: 'SKILL.md' }],
          truncated: false,
        }
      return { totalCount: 0, items: [], truncated: false }
    })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        standardsFiles: ['.claude/skills/django-migrations/SKILL.md', '.agents/skills/tdd/SKILL.md'],
      })
    )
  })

  it('treats verified-empty files as reviewed: no omission, no partial verdict, APPROVE still possible', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'apps/coverage/__init__.py', status: 'added', additions: 0, deletions: 0 },
    ])
    mockStat.mockResolvedValue({ isFile: () => true, size: 0 })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockStat).toHaveBeenCalledWith('/tmp/wt-pr-7/apps/coverage/__init__.py')
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        omitted: [],
        empty: [{ filename: 'apps/coverage/__init__.py', status: 'added' }],
      })
    )
    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('APPROVE')
    expect(review.body).not.toMatch(/Partial review/)
    expect(review.body).not.toMatch(/Not reviewed/)
  })

  it('keeps a patch-less 0/0 file omitted when it cannot be verified empty (binary or stat failure)', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'assets/logo.png', status: 'added', additions: 0, deletions: 0 },
    ])
    mockStat.mockResolvedValue({ isFile: () => true, size: 2048 })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        omitted: [{ filename: 'assets/logo.png', reason: 'no-patch' }],
        empty: [],
      })
    )
    // An omitted file still blocks APPROVE and demotes to partial.
    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('COMMENT')
    expect(review.body).toMatch(/Partial review/)
  })

  it('never stats author-controlled paths that escape the checkout', async () => {
    setupHappyPath()
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: '../../../etc/passwd', status: 'added', additions: 0, deletions: 0 },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(mockStat).not.toHaveBeenCalled()
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(
      expect.objectContaining({ omitted: [{ filename: '../../../etc/passwd', reason: 'no-patch' }] })
    )
  })

  it('detects the story referenced in the branch name and hands the reference (not the text) to the agent', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'deadbeef', ref: 'feature/sc-1234-rounding' } }) })
    mockShortcutConfigured.mockReturnValue(true)

    await runReview(trigger(), { logger: silentLogger })

    // Hybrid spec axis: the server detects the reference, the agent fetches
    // the story itself through its Shortcut tools.
    expect(mockGetStory).not.toHaveBeenCalled()
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ storyId: 1234 }))
  })

  it('passes no story reference when none is found', async () => {
    setupHappyPath()
    mockShortcutConfigured.mockReturnValue(true)

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ storyId: null }))
  })

  it('passes no story reference when shortcut is not configured', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'deadbeef', ref: 'feature/sc-1234-rounding' } }) })
    mockShortcutConfigured.mockReturnValue(false)

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ storyId: null }))
  })

  it('still reviews when standards discovery fails', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'deadbeef', ref: 'feature/sc-99' } }) })
    mockFindFiles.mockRejectedValue(new Error('find broke'))

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ standardsFiles: [] }))
    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
  })

  it('reviews the current head when commits landed after the trigger', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'newer-sha' } }) })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].commitId).toBe('newer-sha')
  })

  it('skips silently when the PR was closed while queued', async () => {
    setupHappyPath({ pr: prData({ state: 'closed' }) })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockListPullRequestFiles).not.toHaveBeenCalled()
    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
  })

  it('comments on the PR when the review cannot be completed', async () => {
    mockGetPullRequest.mockResolvedValue(prData())
    mockListPullRequestFiles.mockRejectedValue(new Error('boom'))
    mockCreateIssueComment.mockResolvedValue({ id: 3 })

    await expect(runReview(trigger(), { logger: silentLogger })).resolves.toBeUndefined()

    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    const [repo, prNumber, body] = mockCreateIssueComment.mock.calls[0]
    expect(repo).toBe('acme-io/app')
    expect(prNumber).toBe(7)
    expect(body).toMatch(/could not complete/i)
    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
  })

  it('never throws even if the failure comment itself fails', async () => {
    mockGetPullRequest.mockResolvedValue(prData())
    mockListPullRequestFiles.mockRejectedValue(new Error('boom'))
    mockCreateIssueComment.mockRejectedValue(new Error('also boom'))

    await expect(runReview(trigger(), { logger: silentLogger })).resolves.toBeUndefined()
  })

  it('reviews from a worktree of the PR head and binds the agent tools to it', async () => {
    setupHappyPath()

    await runReview(trigger(), { logger: silentLogger })

    expect(mockAcquireWorktree).toHaveBeenCalledWith('acme-io/app', 7)
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ rootPath: '/tmp/wt-pr-7' }))
    expect(mockAcquire).not.toHaveBeenCalled()
  })

  it('releases the workspace in success and failure', async () => {
    setupHappyPath()
    await runReview(trigger(), { logger: silentLogger })
    expect(mockWorktreeRelease).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    mockAcquireWorktree.mockResolvedValue({ localPath: '/tmp/wt-pr-7', release: mockWorktreeRelease })
    mockGetPullRequest.mockResolvedValue(prData())
    mockListPullRequestFiles.mockRejectedValue(new Error('boom'))
    mockFindFilesAt.mockResolvedValue({ totalCount: 0, items: [], truncated: false })
    mockCreateIssueComment.mockResolvedValue({})
    await runReview(trigger(), { logger: silentLogger })
    expect(mockWorktreeRelease).toHaveBeenCalledTimes(1)
  })

  it('falls back to the default-branch clone when the worktree cannot be created', async () => {
    setupHappyPath()
    mockAcquireWorktree.mockRejectedValue(new Error('fetch failed'))

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ rootPath: '/tmp/x' }))
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('continues without a checkout when the pool cannot provide one', async () => {
    setupHappyPath()
    mockAcquireWorktree.mockRejectedValue(new Error('fetch failed'))
    mockAcquire.mockRejectedValue(new Error('pool full'))

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ rootPath: null }))
    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
  })

  it('puts the eyes reaction on the PR while reviewing and removes it when done', async () => {
    setupHappyPath()

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreateIssueReaction).toHaveBeenCalledWith('acme-io/app', 7, 'eyes')
    expect(mockDeleteIssueReaction).toHaveBeenCalledWith('acme-io/app', 7, 9001)
  })

  it('still reviews when the reaction cannot be added', async () => {
    setupHappyPath()
    mockCreateIssueReaction.mockRejectedValue(new Error('reactions API down'))

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    expect(mockDeleteIssueReaction).not.toHaveBeenCalled()
  })

  it('never throws and still releases the workspace when removing the reaction fails', async () => {
    setupHappyPath()
    mockDeleteIssueReaction.mockRejectedValue(new Error('reaction already gone'))

    await expect(runReview(trigger(), { logger: silentLogger })).resolves.toBeUndefined()

    expect(mockWorktreeRelease).toHaveBeenCalledTimes(1)
  })

  it('redacts credentials from the review body and inline comments before posting', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [
        {
          path: 'src/checkout.js',
          line: 11,
          severity: 'major',
          axis: 'correctness',
          body: 'Hardcoded token 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 must move to env.',
        },
      ],
    })
    mockRunReviewerAgent.mockResolvedValue({
      summary: 'Connects with postgres://app:s3cr3t@db.internal/soporti which leaks credentials.',
      verdict: 'comment',
      findings: [
        {
          path: 'src/checkout.js',
          line: 11,
          severity: 'major',
          axis: 'correctness',
          body: 'Hardcoded token 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 must move to env.',
        },
      ],
    })

    await runReview(trigger(), { logger: silentLogger })

    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.body).not.toContain('s3cr3t')
    expect(review.body).toContain('postgres://[redacted]@db.internal/soporti')
    expect(review.comments[0].body).not.toContain('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')
    expect(review.comments[0].body).toContain('[redacted]')
  })

  it('reports files left out of the review in the body', async () => {
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'package-lock.json', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
    ])
    mockAcquire.mockResolvedValue({ localPath: '/tmp/x', release: mockRelease })
    mockRunReviewerAgent.mockResolvedValue({ summary: 'ok', verdict: 'comment', findings: [] })
    mockCreatePullRequestReview.mockResolvedValue({ id: 1 })

    await runReview(trigger(), { logger: silentLogger })

    const { body } = mockCreatePullRequestReview.mock.calls[0][2]
    expect(body).toContain('package-lock.json')
  })
})

// The verdict header is the fix for "did it finish / is it good or bad?": a
// deterministic line atop every review so a human never has to read the badge.
describe('verdict header', () => {
  beforeEach(() => vi.clearAllMocks())

  function body() {
    return mockCreatePullRequestReview.mock.calls[0][2].body
  }

  it('leads an approved review with a clear approval line', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toMatch(/^### ✅ \*\*Approved\*\*/)
  })

  it('leads a clean comment review with LGTM and the human-approval reminder', async () => {
    setupHappyPath({ verdict: 'comment', findings: [] })

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toMatch(/^### 👍 \*\*LGTM\*\*/)
    expect(body()).toContain('human approval is still needed')
  })

  it('leads with "review needed" and a severity rollup when there is a blocking finding', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [
        { path: 'src/checkout.js', line: 11, severity: 'major', axis: 'correctness', body: 'sumItems may throw' },
        { path: 'src/checkout.js', line: 11, severity: 'minor', axis: 'correctness', body: 'rename' },
      ],
    })

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toMatch(/^### 🔎 \*\*Review needed\*\* — 1 major · 1 minor/)
  })

  it('stays at LGTM (not "review needed") when findings are only minor or nit', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [{ path: 'src/checkout.js', line: 11, severity: 'minor', axis: 'standards', body: 'rename' }],
    })

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toMatch(/^### 👍 \*\*LGTM\*\* — only 1 minor/)
  })

  it('never dresses an incomplete review as LGTM, even with no findings', async () => {
    setupHappyPath({ verdict: 'comment', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'package-lock.json', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toMatch(/^### 🔎 \*\*Partial review\*\*/)
    expect(body()).toContain('some files not reviewed')
    expect(body()).not.toContain('LGTM')
  })

  it('keeps "review needed" (not partial) but still flags omitted files when a blocking finding exists', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [{ path: 'src/checkout.js', line: 11, severity: 'major', axis: 'correctness', body: 'boom' }],
    })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'package-lock.json', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toMatch(/^### 🔎 \*\*Review needed\*\* — 1 major/)
    expect(body()).toContain('some files not reviewed')
  })
})
