import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPullRequest = vi.fn()
const mockListPullRequestFiles = vi.fn()
const mockCompareCommits = vi.fn()
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
  compareCommits: mockCompareCommits,
  createPullRequestReview: mockCreatePullRequestReview,
  createIssueComment: mockCreateIssueComment,
  createIssueReaction: mockCreateIssueReaction,
  deleteIssueReaction: mockDeleteIssueReaction,
}))

vi.mock('./agent.js', () => ({
  runReviewerAgent: mockRunReviewerAgent,
}))

const mockVerifyFindings = vi.fn()
vi.mock('./verify.js', () => ({
  verifyFindings: mockVerifyFindings,
}))

const mockLoadReviewHistory = vi.fn()
vi.mock('./history.js', () => ({
  loadReviewHistory: mockLoadReviewHistory,
}))

const mockLoadCiStatus = vi.fn()
vi.mock('./ci-status.js', () => ({
  loadCiStatus: mockLoadCiStatus,
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

const mockStat = vi.fn()
const mockReadFile = vi.fn()
vi.mock('node:fs/promises', () => ({ stat: mockStat, readFile: mockReadFile }))

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
    base: { ref: 'main', sha: 'base0001' },
    additions: 2,
    deletions: 1,
    ...overrides,
  }
}

function reviewed(output, reviewedPaths = ['src/checkout.js']) {
  return { output, reviewedPaths: new Set(reviewedPaths) }
}

function setupHappyPath({ verdict = 'comment', findings = [], pr = prData(), reviewedPaths } = {}) {
  mockGetPullRequest.mockResolvedValue(pr)
  mockListPullRequestFiles.mockResolvedValue([
    { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
  ])
  mockAcquire.mockResolvedValue({ localPath: '/tmp/x', release: mockRelease })
  mockAcquireWorktree.mockResolvedValue({ localPath: '/tmp/wt-pr-7', release: mockWorktreeRelease })
  mockFindFiles.mockResolvedValue({ totalCount: 0, items: [], truncated: false })
  mockFindFilesAt.mockResolvedValue({ totalCount: 0, items: [], truncated: false })
  mockShortcutConfigured.mockReturnValue(false)
  mockRunReviewerAgent.mockResolvedValue(reviewed({ summary: 'Looks reasonable.', verdict, findings }, reviewedPaths))
  mockVerifyFindings.mockImplementation(async proposed => proposed)
  mockCreatePullRequestReview.mockResolvedValue({ id: 1 })
  mockCreateIssueReaction.mockResolvedValue({ id: 9001, content: 'eyes' })
  mockDeleteIssueReaction.mockResolvedValue(undefined)
  mockStat.mockRejectedValue(new Error('ENOENT'))
  mockReadFile.mockRejectedValue(new Error('ENOENT'))
  mockCompareCommits.mockResolvedValue({ status: 'ahead', files: [], mergeBaseSha: 'merge000' })
  mockLoadReviewHistory.mockResolvedValue(null)
  mockLoadCiStatus.mockResolvedValue(null)
}

function reReviewHistory(changes = { status: 'incremental', files: [] }) {
  return {
    lastReviewedSha: 'abc1234def',
    ownReviews: [],
    ownThreads: [],
    humanReviews: [],
    humanThreads: [],
    conversation: [],
    changes,
  }
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

  it('never approves when the reviewer did not read the diff of a changed source file', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'src/cart.js', status: 'modified', additions: 4, deletions: 0, patch: PATCH },
    ])

    await runReview(trigger(), { logger: silentLogger })

    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('COMMENT')
    expect(review.body).toMatch(/^### 🔎 \*\*Partial review\*\*/)
    expect(review.body).toContain('> ⚠️ Not reviewed (not opened by the reviewer): `src/cart.js`')
    expect(review.body).not.toContain('`src/checkout.js`')
  })

  it('approves a PR whose only unread changes are generated files', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'package-lock.json', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
      { filename: 'server/drizzle/meta/0007_snapshot.json', status: 'added', additions: 900, deletions: 0 },
    ])

    await runReview(trigger(), { logger: silentLogger })

    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('APPROVE')
    expect(review.body).not.toMatch(/Partial review/)
    expect(review.body).not.toMatch(/Not reviewed/)
  })

  it('reviews a PR over 4000 changed lines in full when the reviewer reads every diff', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      filename: `src/module-${i}.js`,
      status: 'added',
      additions: 1000,
      deletions: 0,
      patch: '@@ -0,0 +1,1000 @@\n+x',
    }))
    setupHappyPath({ verdict: 'approve', findings: [], reviewedPaths: files.map(file => file.filename) })
    mockListPullRequestFiles.mockResolvedValue(files)

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledTimes(1)
    expect(mockRunReviewerAgent.mock.calls[0][0].files.map(file => file.filename)).toEqual(
      files.map(file => file.filename)
    )
    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('APPROVE')
    expect(review.body).not.toMatch(/Partial review|Not reviewed/)
  })

  it('hands every changed file to the agent, flagged as generated or not', async () => {
    setupHappyPath()
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'yarn.lock', status: 'modified', additions: 30, deletions: 2, patch: '@@ -1 +1 @@' },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent.mock.calls[0][0].files).toEqual([
      expect.objectContaining({ filename: 'src/checkout.js', generated: false, empty: false }),
      expect.objectContaining({ filename: 'yarn.lock', generated: true, empty: false }),
    ])
  })

  it('treats the linguist-generated paths of the checkout .gitattributes as generated', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'api/schema.pb.go', status: 'modified', additions: 300, deletions: 120, patch: PATCH },
    ])
    mockReadFile.mockResolvedValue('*.pb.go linguist-generated=true\n')

    await runReview(trigger(), { logger: silentLogger })

    expect(mockReadFile).toHaveBeenCalledWith('/tmp/wt-pr-7/.gitattributes', 'utf-8')
    expect(mockRunReviewerAgent.mock.calls[0][0].files[1]).toEqual(
      expect.objectContaining({ filename: 'api/schema.pb.go', generated: true })
    )
    expect(mockCreatePullRequestReview.mock.calls[0][2].event).toBe('APPROVE')
  })

  it('anchors findings on any file with a patch, not only the ones that once fit a budget', async () => {
    setupHappyPath({
      findings: [{ path: 'src/cart.js', line: 11, severity: 'minor', axis: 'correctness', body: 'rename' }],
      reviewedPaths: ['src/checkout.js', 'src/cart.js'],
    })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'src/cart.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].comments).toEqual([
      expect.objectContaining({ path: 'src/cart.js', line: 11, side: 'RIGHT' }),
    ])
  })

  it('resolves the merge base so the agent can diff patch-less files in the PR-head checkout', async () => {
    setupHappyPath()
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'db/seed.sql', status: 'modified', additions: 9000, deletions: 0 },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCompareCommits).toHaveBeenCalledTimes(1)
    expect(mockCompareCommits).toHaveBeenCalledWith('acme-io/app', 'base0001', 'deadbeef')
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: '/tmp/wt-pr-7', diffBaseSha: 'merge000' })
    )
  })

  it('compares against the base branch name when GitHub gives no base sha', async () => {
    setupHappyPath({ pr: prData({ base: { ref: 'main' } }) })
    mockListPullRequestFiles.mockResolvedValue([{ filename: 'db/seed.sql', status: 'modified', additions: 9000 }])

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCompareCommits).toHaveBeenCalledWith('acme-io/app', 'main', 'deadbeef')
  })

  it('skips the merge base when every file has a patch', async () => {
    setupHappyPath()

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCompareCommits).not.toHaveBeenCalled()
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ diffBaseSha: null }))
  })

  it('never diffs locally on a default-branch clone, so a patch-less file stays not reviewed', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockAcquireWorktree.mockRejectedValue(new Error('fetch failed'))
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'db/seed.sql', status: 'modified', additions: 9000, deletions: 0 },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCompareCommits).not.toHaveBeenCalled()
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: '/tmp/x', diffBaseSha: null })
    )
    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('COMMENT')
    expect(review.body).toContain('Not reviewed (not opened by the reviewer): `db/seed.sql`')
  })

  it('still reviews without the local diff fallback when the merge base cannot be resolved', async () => {
    setupHappyPath()
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'db/seed.sql', status: 'modified', additions: 9000, deletions: 0 },
    ])
    mockCompareCommits.mockRejectedValue(new Error('Not Found'))
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runReview(trigger(), { logger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ diffBaseSha: null }))
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Not Found'))
    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
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

  it('treats verified-empty files as reviewed: no partial verdict, APPROVE still possible', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'apps/coverage/__init__.py', status: 'added', additions: 0, deletions: 0 },
    ])
    mockStat.mockResolvedValue({ isFile: () => true, size: 0 })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockStat).toHaveBeenCalledWith('/tmp/wt-pr-7/apps/coverage/__init__.py')
    expect(mockRunReviewerAgent.mock.calls[0][0].files[1]).toEqual(
      expect.objectContaining({ filename: 'apps/coverage/__init__.py', empty: true })
    )
    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('APPROVE')
    expect(review.body).not.toMatch(/Partial review/)
    expect(review.body).not.toMatch(/Not reviewed/)
  })

  it('keeps a patch-less 0/0 file required when it cannot be verified empty (binary or stat failure)', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'assets/logo.png', status: 'added', additions: 0, deletions: 0 },
    ])
    mockStat.mockResolvedValue({ isFile: () => true, size: 2048 })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent.mock.calls[0][0].files[1]).toEqual(
      expect.objectContaining({ filename: 'assets/logo.png', empty: false })
    )
    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('COMMENT')
    expect(review.body).toMatch(/Partial review/)
    expect(review.body).toContain('`assets/logo.png`')
  })

  it('never stats author-controlled paths that escape the checkout', async () => {
    setupHappyPath()
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: '../../../etc/passwd', status: 'added', additions: 0, deletions: 0 },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(mockStat).not.toHaveBeenCalled()
    expect(mockRunReviewerAgent.mock.calls[0][0].files[1]).toEqual(
      expect.objectContaining({ filename: '../../../etc/passwd', empty: false })
    )
  })

  it('detects the story referenced in the branch name and hands the reference (not the text) to the agent', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'deadbeef', ref: 'feature/sc-1234-rounding' } }) })
    mockShortcutConfigured.mockReturnValue(true)

    await runReview(trigger(), { logger: silentLogger })

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
    expect(body).not.toContain('REVIEW_MAX_TURNS')
    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
  })

  it('names the turn limit as the cause when the review runs out of turns', async () => {
    setupHappyPath()
    mockRunReviewerAgent.mockRejectedValue(
      Object.assign(new Error('The review hit the turn limit of 50 turns.'), {
        code: 'REVIEW_TURN_LIMIT',
        maxTurns: 50,
      })
    )
    mockCreateIssueComment.mockResolvedValue({ id: 3 })
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runReview(trigger(), { logger })

    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    const body = mockCreateIssueComment.mock.calls[0][2]
    expect(body).toMatch(/could not complete/i)
    expect(body).toContain('hit the turn limit (50 turns)')
    expect(body).toContain('the PR may be too large for one review')
    expect(body).toContain('`REVIEW_MAX_TURNS` can be raised')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0]).toBe('[review] Failed acme-io/app#7@deadbeef: hit the turn limit (50 turns)')
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
    mockRunReviewerAgent.mockResolvedValue(
      reviewed({
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
    )

    await runReview(trigger(), { logger: silentLogger })

    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.body).not.toContain('s3cr3t')
    expect(review.body).toContain('postgres://[redacted]@db.internal/soporti')
    expect(review.comments[0].body).not.toContain('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')
    expect(review.comments[0].body).toContain('[redacted]')
  })

  it('reports a patch-less file the reviewer never opened in the body', async () => {
    setupHappyPath()
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'db/seed.sql', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
    ])

    await runReview(trigger(), { logger: silentLogger })

    const { body } = mockCreatePullRequestReview.mock.calls[0][2]
    expect(body).toContain('> ⚠️ Not reviewed (not opened by the reviewer): `db/seed.sql`')
  })
})

describe('re-reviews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the PR history for the reviewed head and hands it to the agent', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'newhead1', ref: 'fix/totals' } }) })
    const history = reReviewHistory()
    mockLoadReviewHistory.mockResolvedValue(history)

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockLoadReviewHistory).toHaveBeenCalledTimes(1)
    expect(mockLoadReviewHistory).toHaveBeenCalledWith(
      {
        repoFullName: 'acme-io/app',
        prNumber: 7,
        headSha: 'newhead1',
        reviewerLogin: 'soporti-bot',
        files: [expect.objectContaining({ filename: 'src/checkout.js' })],
      },
      { logger: silentLogger }
    )
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ history }))
  })

  it('says in the footer that it re-reviewed the changes since the previous review', async () => {
    setupHappyPath()
    mockLoadReviewHistory.mockResolvedValue(reReviewHistory())

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockCreatePullRequestReview.mock.calls[0][2].body).toContain(
      '_Automated review by Soporti · trigger: review request · re-review since `abc1234`._'
    )
  })

  it('says in the footer that it re-reviewed the full diff after a force-push', async () => {
    setupHappyPath()
    mockLoadReviewHistory.mockResolvedValue(reReviewHistory({ status: 'diverged' }))

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockCreatePullRequestReview.mock.calls[0][2].body).toContain(
      'trigger: review request · re-review of the full diff._'
    )
  })

  it('keeps the re-review footer on the body-only fallback', async () => {
    setupHappyPath({ findings: [{ path: 'src/checkout.js', line: 11, severity: 'major', body: 'bug' }] })
    mockLoadReviewHistory.mockResolvedValue(reReviewHistory())
    mockCreatePullRequestReview
      .mockRejectedValueOnce(Object.assign(new Error('Validation Failed'), { status: 422 }))
      .mockResolvedValueOnce({ id: 2 })

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(2)
    expect(mockCreatePullRequestReview.mock.calls[1][2].body).toContain('re-review since `abc1234`')
  })

  it('posts a first-time footer when there is no previous review', async () => {
    setupHappyPath()

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    const { body } = mockCreatePullRequestReview.mock.calls[0][2]
    expect(body).toContain('_Automated review by Soporti · trigger: review request._')
    expect(body).not.toContain('re-review')
  })
})

describe('CI status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the CI status of the reviewed head and hands it to the agent', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'newhead1', ref: 'fix/totals' } }) })
    const ciStatus = {
      checks: [{ name: 'lint', state: 'failed', result: 'failure', details: '2 problems' }],
      incomplete: false,
    }
    mockLoadCiStatus.mockResolvedValue(ciStatus)

    await runReview(trigger(), { logger: silentLogger })

    expect(mockLoadCiStatus).toHaveBeenCalledTimes(1)
    expect(mockLoadCiStatus).toHaveBeenCalledWith(
      { repoFullName: 'acme-io/app', headSha: 'newhead1' },
      { logger: silentLogger }
    )
    expect(mockRunReviewerAgent).toHaveBeenCalledTimes(1)
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ ciStatus }))
  })

  it('reviews without waiting while CI is still running', async () => {
    setupHappyPath()
    const ciStatus = {
      checks: [{ name: 'test', state: 'pending', result: 'pending (in_progress)', details: '' }],
      incomplete: false,
    }
    mockLoadCiStatus.mockResolvedValue(ciStatus)

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ ciStatus }))
    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    expect(mockCreatePullRequestReview.mock.calls[0][2].commitId).toBe('deadbeef')
  })

  it('still posts the review when the CI status could not be loaded', async () => {
    setupHappyPath()

    await runReview(trigger(), { logger: silentLogger })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ ciStatus: null }))
    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
  })
})

describe('finding verification', () => {
  beforeEach(() => vi.clearAllMocks())

  const MAJOR = {
    path: 'src/checkout.js',
    line: 11,
    severity: 'major',
    axis: 'correctness',
    body: 'sumItems may throw',
  }
  const MINOR = { path: 'src/checkout.js', line: 12, severity: 'minor', axis: 'standards', body: 'rename total' }

  it('verifies the proposed findings against the reviewed checkout before posting', async () => {
    setupHappyPath({ findings: [MAJOR, MINOR] })
    const controller = new AbortController()

    await runReview(trigger(), { logger: silentLogger, signal: controller.signal })

    expect(mockVerifyFindings).toHaveBeenCalledTimes(1)
    expect(mockVerifyFindings).toHaveBeenCalledWith([MAJOR, MINOR], {
      trigger: expect.objectContaining({ repoFullName: 'acme-io/app', prNumber: 7, headSha: 'deadbeef' }),
      files: [expect.objectContaining({ filename: 'src/checkout.js', generated: false })],
      rootPath: '/tmp/wt-pr-7',
      diffBaseSha: null,
      signal: controller.signal,
      logger: silentLogger,
    })
  })

  it('does not post a refuted finding', async () => {
    setupHappyPath({ findings: [MAJOR, MINOR] })
    mockVerifyFindings.mockResolvedValue([MINOR])

    await runReview(trigger(), { logger: silentLogger })

    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.comments).toEqual([expect.objectContaining({ line: 12, body: expect.stringContaining('rename') })])
    expect(review.body).not.toContain('sumItems may throw')
    expect(review.body).toMatch(/^### 👍 \*\*LGTM\*\* — only 1 minor/)
  })

  it('posts a downgraded finding with its new severity in the comment and the verdict header', async () => {
    setupHappyPath({ findings: [MAJOR] })
    mockVerifyFindings.mockResolvedValue([{ ...MAJOR, severity: 'minor' }])

    await runReview(trigger(), { logger: silentLogger })

    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.comments[0].body).toBe('**[minor]** sumItems may throw')
    expect(review.body).toMatch(/^### 👍 \*\*LGTM\*\* — only 1 minor/)
  })

  it('never approves once the reviewer proposed a blocking finding, even when verification refuted it', async () => {
    setupHappyPath({ verdict: 'approve', findings: [MAJOR] })
    mockVerifyFindings.mockResolvedValue([])

    await runReview(trigger(), { logger: silentLogger })

    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('COMMENT')
    expect(review.comments).toEqual([])
    expect(review.body).toMatch(/^### 👍 \*\*LGTM\*\* — no blocking issues/)
  })

  it('never approves when verification downgraded every blocking finding, but posts the lower severities', async () => {
    setupHappyPath({ verdict: 'approve', findings: [{ ...MAJOR, severity: 'critical' }, MAJOR] })
    mockVerifyFindings.mockResolvedValue([
      { ...MAJOR, severity: 'minor' },
      { ...MAJOR, severity: 'nit' },
    ])

    await runReview(trigger(), { logger: silentLogger })

    const review = mockCreatePullRequestReview.mock.calls[0][2]
    expect(review.event).toBe('COMMENT')
    expect(review.comments.map(comment => comment.body)).toEqual([
      '**[minor]** sumItems may throw',
      '**[nit]** sumItems may throw',
    ])
    expect(review.body).toMatch(/^### 👍 \*\*LGTM\*\* — only 1 minor · 1 nit/)
  })

  it('still approves an approved review whose findings were only minor or nit', async () => {
    setupHappyPath({ verdict: 'approve', findings: [MINOR] })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].event).toBe('APPROVE')
  })

  it('posts nothing when a newer request supersedes the review during verification', async () => {
    setupHappyPath({ findings: [MAJOR] })
    const controller = new AbortController()
    mockVerifyFindings.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('This operation was aborted', 'AbortError')
    })

    await runReview(trigger(), { logger: silentLogger, signal: controller.signal })

    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
    expect(mockWorktreeRelease).toHaveBeenCalledTimes(1)
  })

  it('posts nothing when the abort lands right after verification finished', async () => {
    setupHappyPath({ findings: [MAJOR] })
    const controller = new AbortController()
    mockVerifyFindings.mockImplementation(async proposed => {
      controller.abort()
      return proposed
    })

    await runReview(trigger(), { logger: silentLogger, signal: controller.signal })

    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
  })
})

describe('superseded reviews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts nothing when a newer request aborts the review mid-run, and still cleans up', async () => {
    setupHappyPath()
    const controller = new AbortController()
    mockRunReviewerAgent.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('This operation was aborted', 'AbortError')
    })

    await runReview(trigger(), { logger: silentLogger, signal: controller.signal })

    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
    expect(mockDeleteIssueReaction).toHaveBeenCalledWith('acme-io/app', 7, 9001)
    expect(mockWorktreeRelease).toHaveBeenCalledTimes(1)
  })

  it('posts nothing when the abort lands right after the agent finished', async () => {
    setupHappyPath()
    const controller = new AbortController()
    mockRunReviewerAgent.mockImplementation(async () => {
      controller.abort()
      return reviewed({ summary: 'late', verdict: 'approve', findings: [] })
    })

    await runReview(trigger(), { logger: silentLogger, signal: controller.signal })

    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
  })

  it('skips the agent when the review was aborted while it loaded the PR', async () => {
    setupHappyPath()
    const controller = new AbortController()
    mockLoadReviewHistory.mockImplementation(async () => {
      controller.abort()
      return null
    })

    await runReview(trigger(), { logger: silentLogger, signal: controller.signal })

    expect(mockRunReviewerAgent).not.toHaveBeenCalled()
    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
  })

  it('hands the abort signal to the agent', async () => {
    setupHappyPath()
    const controller = new AbortController()

    await runReview(trigger(), { logger: silentLogger, signal: controller.signal })

    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }))
    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
  })
})

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
      { filename: 'db/seed.sql', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toMatch(/^### 🔎 \*\*Partial review\*\*/)
    expect(body()).toContain('some files not reviewed')
    expect(body()).not.toContain('LGTM')
  })

  it('keeps "review needed" (not partial) but still flags unreviewed files when a blocking finding exists', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [{ path: 'src/checkout.js', line: 11, severity: 'major', axis: 'correctness', body: 'boom' }],
    })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'db/seed.sql', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toMatch(/^### 🔎 \*\*Review needed\*\* — 1 major/)
    expect(body()).toContain('some files not reviewed')
  })

  it('reviews the current head and reports the mention trigger for a review command', async () => {
    setupHappyPath({ pr: prData({ head: { sha: 'cafe1234', ref: 'fix/totals' } }) })
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const command = {
      ...trigger(),
      kind: 'mention_command',
      headSha: 'HEAD',
      channel: 'issue',
      commentId: 300,
      dedupeKey: 'acme-io/app#7@HEAD',
    }

    await runReview(command, { logger, reviewerLogin: 'soporti-bot' })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    const [repo, prNumber, review] = mockCreatePullRequestReview.mock.calls[0]
    expect([repo, prNumber, review.commitId]).toEqual(['acme-io/app', 7, 'cafe1234'])
    expect(review.body).toContain('_Automated review by Soporti · trigger: mention._')
    expect(logger.log).not.toHaveBeenCalledWith(expect.stringContaining('Head moved'))
  })

  it('reports the label trigger in the footer', async () => {
    setupHappyPath()

    await runReview({ ...trigger(), kind: 'labeled' }, { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockCreatePullRequestReview.mock.calls[0][2].body).toContain(
      '_Automated review by Soporti · trigger: label._'
    )
  })

  it('reports the push trigger in the footer of a re-review started by a push', async () => {
    setupHappyPath()

    await runReview({ ...trigger(), kind: 'synchronize' }, { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    expect(mockCreatePullRequestReview.mock.calls[0][2].body).toContain(
      '_Automated review by Soporti · trigger: push._'
    )
  })
})
