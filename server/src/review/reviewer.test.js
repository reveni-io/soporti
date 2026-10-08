import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPullRequest = vi.fn()
const mockListPullRequestFiles = vi.fn()
const mockCompareCommits = vi.fn()
const mockCreatePullRequestReview = vi.fn()
const mockCreateIssueComment = vi.fn()
const mockListIssueComments = vi.fn()
const mockUpdateIssueComment = vi.fn()
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
  listIssueComments: mockListIssueComments,
  updateIssueComment: mockUpdateIssueComment,
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

const mockLoadStandards = vi.fn()
vi.mock('./standards.js', () => ({
  loadStandards: mockLoadStandards,
}))

const mockLoadSpec = vi.fn()
vi.mock('./spec.js', () => ({
  loadSpec: mockLoadSpec,
}))

const mockAcquireWorktree = vi.fn()
const mockWorktreeRelease = vi.fn()
const mockGitDiffAt = vi.fn()

vi.mock('../repo-pool/index.js', () => ({
  pool: {
    acquire: (...args) => mockAcquire(...args),
    acquireWorktree: (...args) => mockAcquireWorktree(...args),
  },
  gitDiffAt: (...args) => mockGitDiffAt(...args),
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

const WALKTHROUGH_MARKER = '<!-- soporti:walkthrough -->'

function finding(overrides = {}) {
  return {
    path: 'src/checkout.js',
    startLine: null,
    line: 11,
    severity: 'major',
    category: 'bug',
    title: 'sumItems throws on an empty cart.',
    body: 'sumItems may throw on an empty cart',
    suggestion: null,
    fixPrompt: 'Return 0 from sumItems for an empty cart.',
    ...overrides,
  }
}

function reviewerOutput(overrides = {}) {
  return {
    walkthrough: 'Recomputes the checkout total from the cart items.',
    changes: [{ label: 'Checkout', files: ['src/checkout.js'], summary: 'Sums the items.' }],
    effort: 2,
    reviewMinutes: 10,
    diagram: null,
    standards: 'Follows CLAUDE.md.',
    spec: 'No spec available',
    previousFindings: null,
    verdict: 'comment',
    findings: [],
    ...overrides,
  }
}

function reviewed(output, reviewedPaths = ['src/checkout.js']) {
  return { output: reviewerOutput(output), reviewedPaths: new Set(reviewedPaths) }
}

function postedReview(call = 0) {
  return mockCreatePullRequestReview.mock.calls[call][2]
}

function postedWalkthrough() {
  return mockCreateIssueComment.mock.calls.find(([, , body]) => body.startsWith(WALKTHROUGH_MARKER))?.[2]
}

function setupHappyPath({ verdict = 'comment', findings = [], pr = prData(), reviewedPaths } = {}) {
  mockGetPullRequest.mockResolvedValue(pr)
  mockListPullRequestFiles.mockResolvedValue([
    { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
  ])
  mockAcquire.mockResolvedValue({ localPath: '/tmp/x', release: mockRelease })
  mockAcquireWorktree.mockResolvedValue({ localPath: '/tmp/wt-pr-7', release: mockWorktreeRelease })
  mockLoadStandards.mockResolvedValue({ documents: [], notInlined: [] })
  mockLoadSpec.mockResolvedValue({ configured: false, stories: [] })
  mockGitDiffAt.mockResolvedValue('@@ -0,0 +1 @@\n+local')
  mockRunReviewerAgent.mockResolvedValue(reviewed({ verdict, findings }, reviewedPaths))
  mockVerifyFindings.mockImplementation(async proposed => proposed)
  mockCreatePullRequestReview.mockResolvedValue({ id: 1 })
  mockCreateIssueComment.mockResolvedValue({ id: 50 })
  mockListIssueComments.mockResolvedValue([])
  mockUpdateIssueComment.mockResolvedValue({ id: 50 })
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
        finding(),
        finding({ line: 500, severity: 'minor', category: 'standards', title: 'Adds a code comment.' }),
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
      {
        path: 'src/checkout.js',
        line: 11,
        side: 'RIGHT',
        body: expect.stringMatching(
          /^\*\*🐛 Bug\*\* \| \*\*🟠 Major\*\*\n\n\*\*sumItems throws on an empty cart\.\*\*/
        ),
      },
    ])
    expect(review.body.split('\n')[0]).toBe('**Actionable comments posted: 1** · 🟠 1 major · 🟡 1 minor')
    expect(review.body).toContain('<summary>⚠️ Outside diff range comments (1)</summary>')
    expect(review.body).toContain('`500`: **📏 Standards** | **🟡 Minor**\n\n**Adds a code comment.**')
  })

  it('anchors a multi-line finding to its range with a committable suggestion', async () => {
    setupHappyPath({
      findings: [
        finding({ startLine: 10, line: 12, suggestion: 'const cart = getCart()\nconst total = sumItems(cart)' }),
      ],
    })

    await runReview(trigger(), { logger: silentLogger })

    const [comment] = postedReview().comments
    expect(comment).toEqual(
      expect.objectContaining({ path: 'src/checkout.js', start_line: 10, start_side: 'RIGHT', line: 12, side: 'RIGHT' })
    )
    expect(comment.body).toContain('```suggestion\nconst cart = getCart()\nconst total = sumItems(cart)\n```')
  })

  it('falls back to a single-line comment with a proposed fix when the range leaves the hunk', async () => {
    setupHappyPath({ findings: [finding({ startLine: 3, line: 12, suggestion: 'const total = 0' })] })

    await runReview(trigger(), { logger: silentLogger })

    const [comment] = postedReview().comments
    expect(comment).toEqual(expect.objectContaining({ line: 12, side: 'RIGHT' }))
    expect(comment).not.toHaveProperty('start_line')
    expect(comment.body).toContain('<summary>🛠️ Proposed fix</summary>')
    expect(comment.body).not.toContain('```suggestion')
  })

  it('never posts a nit inline, even on a commentable line', async () => {
    setupHappyPath({ findings: [finding({ severity: 'nit', line: 12, title: 'Rename total.' })] })

    await runReview(trigger(), { logger: silentLogger })

    const review = postedReview()
    expect(review.comments).toEqual([])
    expect(review.body.split('\n')[0]).toBe('**Actionable comments posted: 0**')
    expect(review.body).toContain('<summary>🧹 Nitpick comments (1)</summary>')
    expect(review.body).toContain('`12`: **🐛 Bug** | **🔵 Nit**\n\n**Rename total.**')
  })

  it('posts an APPROVE review when the agent approves without blocking findings', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].event).toBe('APPROVE')
  })

  it('downgrades an approve to COMMENT when a critical or major finding exists', async () => {
    setupHappyPath({ verdict: 'approve', findings: [finding()] })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview.mock.calls[0][2].event).toBe('COMMENT')
  })

  it('falls back to a body-only review that lists the actionable findings when GitHub rejects the inline comments', async () => {
    setupHappyPath({ verdict: 'comment', findings: [finding()] })
    mockCreatePullRequestReview
      .mockRejectedValueOnce(Object.assign(new Error('Validation Failed'), { status: 422 }))
      .mockResolvedValueOnce({ id: 2 })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(2)
    const second = postedReview(1)
    expect(second.comments).toBeUndefined()
    expect(second.body.split('\n')[0]).toBe('**Actionable comments posted: 1** · 🟠 1 major')
    expect(second.body).toContain('<details open>\n<summary>💬 Actionable comments (1)</summary>')
    expect(second.body).toContain('`11`: **🐛 Bug** | **🟠 Major**\n\n**sumItems throws on an empty cart.**')
    expect(second.body).toContain('Actionable comments:\nIn @src/checkout.js:\n- At line 11: Return 0 from sumItems')
  })

  it('never approves when the reviewer did not read the diff of a changed source file', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'src/cart.js', status: 'modified', additions: 4, deletions: 0, patch: PATCH },
    ])

    await runReview(trigger(), { logger: silentLogger })

    const review = postedReview()
    expect(review.event).toBe('COMMENT')
    expect(review.body).toContain('> ⚠️ **Partial review**: 1 file(s) were not reviewed')
    expect(review.body).toContain('<summary>⚠️ Files not reviewed (1)</summary>\n\n- `src/cart.js`\n')
    expect(review.body).toContain('<summary>📒 Files reviewed (1)</summary>\n\n- `src/checkout.js`\n')
  })

  it('approves a PR whose only unread changes are generated files', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'package-lock.json', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
      { filename: 'server/drizzle/meta/0007_snapshot.json', status: 'added', additions: 900, deletions: 0 },
    ])

    await runReview(trigger(), { logger: silentLogger })

    const review = postedReview()
    expect(review.event).toBe('APPROVE')
    expect(review.body).not.toMatch(/Partial review|Files not reviewed/)
    expect(review.body).toContain('<summary>⏭️ Files skipped (2)</summary>')
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
    const review = postedReview()
    expect(review.event).toBe('APPROVE')
    expect(review.body).not.toMatch(/Partial review|Files not reviewed/)
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
      findings: [finding({ path: 'src/cart.js', severity: 'minor' })],
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

  it('loads the diff of a patch-less file from the PR-head checkout once, for the reviewer and the verifier', async () => {
    setupHappyPath({
      findings: [finding({ path: 'db/seed.sql', line: 1, title: 'Drops the orders table.', body: 'drops a table' })],
      reviewedPaths: ['src/checkout.js', 'db/seed.sql'],
    })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'db/seed.sql', status: 'modified', additions: 9000, deletions: 0 },
      { filename: 'yarn.lock', status: 'modified', additions: 9000, deletions: 0 },
    ])
    mockGitDiffAt.mockResolvedValue('@@ -0,0 +1 @@\n+drop table orders;\n')

    await runReview(trigger(), { logger: silentLogger })

    expect(mockGitDiffAt).toHaveBeenCalledTimes(1)
    expect(mockGitDiffAt).toHaveBeenCalledWith('/tmp/wt-pr-7', 'db/seed.sql', { baseSha: 'merge000' })
    const { files } = mockRunReviewerAgent.mock.calls[0][0]
    expect(files[1]).toEqual(
      expect.objectContaining({ filename: 'db/seed.sql', patch: '@@ -0,0 +1 @@\n+drop table orders;\n' })
    )
    expect(files[2]).toEqual(expect.objectContaining({ filename: 'yarn.lock', generated: true }))
    expect(files[2].patch).toBeUndefined()
    expect(mockVerifyFindings.mock.calls[0][1].files).toBe(files)
    const review = postedReview()
    expect(review.comments).toEqual([])
    expect(review.body).toContain('<summary>db/seed.sql (1)</summary><blockquote>\n\n`1`: **🐛 Bug** | **🟠 Major**')
  })

  it('leaves a file for get_file_diff when its local diff fails', async () => {
    setupHappyPath()
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'db/seed.sql', status: 'modified', additions: 9000, deletions: 0 },
    ])
    mockGitDiffAt.mockRejectedValue(new Error('Could not fetch the base commit merge000.'))
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runReview(trigger(), { logger })

    expect(mockRunReviewerAgent.mock.calls[0][0].files[1].patch).toBeUndefined()
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ diffBaseSha: 'merge000' }))
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not diff db/seed.sql locally'))
    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
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
    expect(mockGitDiffAt).not.toHaveBeenCalled()
    expect(mockRunReviewerAgent.mock.calls[0][0].files[1].patch).toBeUndefined()
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: '/tmp/x', diffBaseSha: null })
    )
    const review = postedReview()
    expect(review.event).toBe('COMMENT')
    expect(review.body).toContain('<summary>⚠️ Files not reviewed (1)</summary>\n\n- `db/seed.sql`\n')
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
    setupHappyPath({ verdict: 'comment', findings: [finding()] })
    mockCreatePullRequestReview.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 503 }))

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueComment).toHaveBeenCalledTimes(2)
    expect(mockCreateIssueComment.mock.calls[0][2]).toContain(WALKTHROUGH_MARKER)
    expect(mockCreateIssueComment.mock.calls[1][2]).toMatch(/could not complete/i)
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

  it('loads the standards for the changed files from the reviewed checkout and hands them to the agent', async () => {
    setupHappyPath()
    const standards = {
      documents: [{ path: 'CLAUDE.md', content: 'No comments.', truncated: false, modified: false }],
      notInlined: [],
    }
    mockLoadStandards.mockResolvedValue(standards)

    await runReview(trigger(), { logger: silentLogger })

    expect(mockLoadStandards).toHaveBeenCalledTimes(1)
    expect(mockLoadStandards).toHaveBeenCalledWith(
      {
        repoFullName: 'acme-io/app',
        rootPath: '/tmp/wt-pr-7',
        files: [expect.objectContaining({ filename: 'src/checkout.js' })],
      },
      { logger: silentLogger }
    )
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ standards }))
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
    const review = postedReview()
    expect(review.event).toBe('APPROVE')
    expect(review.body).not.toMatch(/Partial review|Files not reviewed/)
    expect(review.body).toContain('- `apps/coverage/__init__.py` (empty)')
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
    const review = postedReview()
    expect(review.event).toBe('COMMENT')
    expect(review.body).toMatch(/Partial review/)
    expect(review.body).toContain('<summary>⚠️ Files not reviewed (1)</summary>\n\n- `assets/logo.png`\n')
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

  it('loads the spec from the current branch name, title and body and hands it to the agent', async () => {
    setupHappyPath({
      pr: prData({ title: 'Round refunds (sc-1)', body: 'Spec: sc-2', head: { sha: 'deadbeef', ref: 'feature/sc-3' } }),
    })
    const spec = { configured: true, stories: [{ id: 3, story: null }] }
    mockLoadSpec.mockResolvedValue(spec)

    await runReview(trigger(), { logger: silentLogger })

    expect(mockLoadSpec).toHaveBeenCalledTimes(1)
    expect(mockLoadSpec).toHaveBeenCalledWith(
      expect.objectContaining({ headRef: 'feature/sc-3', title: 'Round refunds (sc-1)', body: 'Spec: sc-2' }),
      { logger: silentLogger }
    )
    expect(mockRunReviewerAgent).toHaveBeenCalledWith(expect.objectContaining({ spec }))
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

  it('redacts credentials from the walkthrough, the review body and the inline comments before posting', async () => {
    setupHappyPath()
    mockRunReviewerAgent.mockResolvedValue(
      reviewed({
        walkthrough: 'Connects with postgres://app:s3cr3t@db.internal/soporti which leaks credentials.',
        findings: [
          finding({ body: 'Hardcoded token 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 must move to env.' }),
          finding({ line: null, severity: 'minor', body: 'Also in postgres://app:s3cr3t@db.internal/soporti.' }),
        ],
      })
    )

    await runReview(trigger(), { logger: silentLogger })

    const review = postedReview()
    expect(postedWalkthrough()).not.toContain('s3cr3t')
    expect(postedWalkthrough()).toContain('postgres://[redacted]@db.internal/soporti')
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

    const { body } = postedReview()
    expect(body).toContain('<summary>⚠️ Files not reviewed (1)</summary>\n\n- `db/seed.sql`\n')
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

  it('says in the review info that it re-reviewed the changes since the previous review', async () => {
    setupHappyPath()
    mockLoadReviewHistory.mockResolvedValue(reReviewHistory())

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(postedReview().body).toContain('- **Commits:** `base000..deadbee` (re-review since `abc1234`)')
  })

  it('says in the review info that it re-reviewed the full diff after a force-push', async () => {
    setupHappyPath()
    mockLoadReviewHistory.mockResolvedValue(reReviewHistory({ status: 'diverged' }))

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(postedReview().body).toContain('- **Commits:** `base000..deadbee` (re-review of the full diff)')
  })

  it('collapses what changed since the last review', async () => {
    setupHappyPath()
    mockLoadReviewHistory.mockResolvedValue(reReviewHistory())
    mockRunReviewerAgent.mockResolvedValue(reviewed({ previousFindings: '- Fixed: the empty cart crash' }))

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(postedReview().body).toContain(
      '<summary>♻️ Since the last review</summary>\n\n- Fixed: the empty cart crash\n'
    )
  })

  it('keeps the re-review info on the body-only fallback', async () => {
    setupHappyPath({ findings: [finding()] })
    mockLoadReviewHistory.mockResolvedValue(reReviewHistory())
    mockCreatePullRequestReview
      .mockRejectedValueOnce(Object.assign(new Error('Validation Failed'), { status: 422 }))
      .mockResolvedValueOnce({ id: 2 })

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(2)
    expect(postedReview(1).body).toContain('re-review since `abc1234`')
  })

  it('reports a first review in the review info and ends with the footer', async () => {
    setupHappyPath()

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    const { body } = postedReview()
    expect(body).toContain('- **Commits:** `base000..deadbee`\n- **Trigger:** review request')
    expect(body).not.toContain('re-review')
    expect(body.endsWith('<sub>Automated review by Soporti</sub>')).toBe(true)
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
    expect(postedWalkthrough()).toContain('| CI | ❌ Failed | 1 failed: lint |')
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
    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    expect(postedWalkthrough()).toContain('| CI | ➖ Skipped | The CI status could not be loaded |')
  })
})

describe('finding verification', () => {
  beforeEach(() => vi.clearAllMocks())

  const MAJOR = finding()
  const MINOR = finding({ line: 12, severity: 'minor', category: 'standards', title: 'Rename total.' })

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

    const review = postedReview()
    expect(review.comments).toEqual([
      expect.objectContaining({ line: 12, body: expect.stringContaining('Rename total.') }),
    ])
    expect(review.body).not.toContain('sumItems throws on an empty cart.')
    expect(review.body.split('\n')[0]).toBe('**Actionable comments posted: 1** · 🟡 1 minor')
    expect(postedWalkthrough()).toContain('**Merge risk:** 🟢 Low · no blocking issues found')
  })

  it('posts a downgraded finding with its new severity in the comment, the header and the merge risk', async () => {
    setupHappyPath({ findings: [MAJOR] })
    mockVerifyFindings.mockResolvedValue([{ ...MAJOR, severity: 'minor' }])

    await runReview(trigger(), { logger: silentLogger })

    const review = postedReview()
    expect(
      review.comments[0].body.startsWith('**🐛 Bug** | **🟡 Minor**\n\n**sumItems throws on an empty cart.**')
    ).toBe(true)
    expect(review.body.split('\n')[0]).toBe('**Actionable comments posted: 1** · 🟡 1 minor')
    expect(postedWalkthrough()).toContain('**Merge risk:** 🟢 Low · no blocking issues found')
  })

  it('never approves once the reviewer proposed a blocking finding, even when verification refuted it', async () => {
    setupHappyPath({ verdict: 'approve', findings: [MAJOR] })
    mockVerifyFindings.mockResolvedValue([])

    await runReview(trigger(), { logger: silentLogger })

    const review = postedReview()
    expect(review.event).toBe('COMMENT')
    expect(review.comments).toEqual([])
    expect(review.body.split('\n')[0]).toBe('**Actionable comments posted: 0**')
  })

  it('never approves when verification downgraded every blocking finding, but posts the lower severities', async () => {
    setupHappyPath({ verdict: 'approve', findings: [{ ...MAJOR, severity: 'critical' }, MAJOR] })
    mockVerifyFindings.mockResolvedValue([
      { ...MAJOR, severity: 'minor' },
      { ...MAJOR, severity: 'nit' },
    ])

    await runReview(trigger(), { logger: silentLogger })

    const review = postedReview()
    expect(review.event).toBe('COMMENT')
    expect(review.comments).toEqual([expect.objectContaining({ line: 11, body: expect.stringContaining('🟡 Minor') })])
    expect(review.body.split('\n')[0]).toBe('**Actionable comments posted: 1** · 🟡 1 minor')
    expect(review.body).toContain('<summary>🧹 Nitpick comments (1)</summary>')
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
      return reviewed({ verdict: 'approve', findings: [] })
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

describe('review body header', () => {
  beforeEach(() => vi.clearAllMocks())

  function body() {
    return postedReview().body
  }

  it('leads an approved review with the approval line', async () => {
    setupHappyPath({ verdict: 'approve', findings: [] })

    await runReview(trigger(), { logger: silentLogger })

    expect(body().split('\n')[0]).toBe('✅ **Approved**: trivial change, safe to merge')
  })

  it('leads a clean comment review with no actionable comments', async () => {
    setupHappyPath({ verdict: 'comment', findings: [] })

    await runReview(trigger(), { logger: silentLogger })

    expect(body().split('\n')[0]).toBe('**Actionable comments posted: 0**')
    expect(body()).not.toMatch(/Partial review|Outside diff range|Nitpick/)
  })

  it('rolls up the severities of the actionable findings', async () => {
    setupHappyPath({
      verdict: 'comment',
      findings: [
        finding({ severity: 'critical' }),
        finding({ severity: 'minor', line: 12 }),
        finding({ severity: 'minor', line: null }),
        finding({ severity: 'nit', line: 13 }),
      ],
    })

    await runReview(trigger(), { logger: silentLogger })

    expect(body().split('\n')[0]).toBe('**Actionable comments posted: 2** · 🔴 1 critical · 🟡 2 minor')
  })

  it('never hides an incomplete review, even with no findings', async () => {
    setupHappyPath({ verdict: 'comment', findings: [] })
    mockListPullRequestFiles.mockResolvedValue([
      { filename: 'src/checkout.js', status: 'modified', additions: 2, deletions: 1, patch: PATCH },
      { filename: 'db/seed.sql', status: 'modified', additions: 5000, deletions: 4000, patch: undefined },
    ])

    await runReview(trigger(), { logger: silentLogger })

    expect(body().split('\n\n').slice(0, 2)).toEqual([
      '**Actionable comments posted: 0**',
      '> ⚠️ **Partial review**: 1 file(s) were not reviewed (listed under Review info). A human needs to check them.',
    ])
    expect(postedWalkthrough()).toContain('**Merge risk:** ⚪ Unknown · 1 file(s) not reviewed')
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
    expect(review.body).toContain('- **Trigger:** mention')
    expect(logger.log).not.toHaveBeenCalledWith(expect.stringContaining('Head moved'))
  })

  it('reports the label trigger in the review info', async () => {
    setupHappyPath()

    await runReview({ ...trigger(), kind: 'labeled' }, { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(body()).toContain('- **Trigger:** label')
  })

  it('reports the push trigger in the review info of a re-review started by a push', async () => {
    setupHappyPath()

    await runReview({ ...trigger(), kind: 'synchronize' }, { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    expect(body()).toContain('- **Trigger:** push')
  })

  it('reports the standards documents and the stories it applied', async () => {
    setupHappyPath()
    mockLoadStandards.mockResolvedValue({
      documents: [{ path: 'REVIEW.md', modified: false, content: 'Flag N+1 queries.', truncated: false }],
      notInlined: [{ path: 'docs/adr/0001-x.md', modified: false }],
    })
    mockLoadSpec.mockResolvedValue({
      configured: true,
      stories: [
        { id: 1234, story: null },
        { id: 1235, story: null },
      ],
    })

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toContain('- **Standards:** `REVIEW.md`, `docs/adr/0001-x.md`\n- **Spec:** sc-1234, sc-1235')
    expect(postedWalkthrough()).toContain('| Spec | ✅ Passed | No spec available |')
  })

  it('reports no spec when Shortcut is not configured, even with story references', async () => {
    setupHappyPath()
    mockLoadSpec.mockResolvedValue({ configured: false, stories: [{ id: 1234, story: null }] })

    await runReview(trigger(), { logger: silentLogger })

    expect(body()).toContain('- **Standards:** none found\n- **Spec:** none')
    expect(postedWalkthrough()).toContain('| Spec | ➖ Skipped | No spec available |')
  })
})

describe('walkthrough comment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts the walkthrough before the review', async () => {
    setupHappyPath({ findings: [finding({ severity: 'critical', title: 'Charges the wrong customer.' })] })

    await runReview(trigger(), { logger: silentLogger })

    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    const [repo, prNumber, walkthrough] = mockCreateIssueComment.mock.calls[0]
    expect([repo, prNumber]).toEqual(['acme-io/app', 7])
    expect(walkthrough).toMatch(/^<!-- soporti:walkthrough -->\n## 📝 Walkthrough\n\nRecomputes the checkout total/)
    expect(walkthrough).toContain('**Merge risk:** 🔴 High · Charges the wrong customer.')
    expect(walkthrough).toContain('Last reviewed commit: `deadbee`')
    expect(mockCreateIssueComment.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreatePullRequestReview.mock.invocationCallOrder[0]
    )
  })

  it('edits its own walkthrough on a re-review instead of posting another one', async () => {
    setupHappyPath()
    mockListIssueComments.mockResolvedValue([
      { id: 77, user: { login: 'soporti-bot' }, body: `${WALKTHROUGH_MARKER}\n## 📝 Walkthrough\n\nOld.` },
    ])

    await runReview(trigger(), { logger: silentLogger, reviewerLogin: 'soporti-bot' })

    expect(mockUpdateIssueComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateIssueComment).toHaveBeenCalledWith(
      'acme-io/app',
      77,
      expect.stringContaining('comment `@soporti-bot review` to request a new one')
    )
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
  })

  it('still posts the review when the walkthrough cannot be posted', async () => {
    setupHappyPath()
    mockCreateIssueComment.mockRejectedValue(new Error('Forbidden'))
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

    await runReview(trigger(), { logger })

    expect(mockCreatePullRequestReview).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      '[review] Could not post the walkthrough on acme-io/app#7 (Forbidden); posting the review anyway'
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('posts no review when a newer request supersedes the run while the walkthrough is posted', async () => {
    setupHappyPath()
    const controller = new AbortController()
    mockCreateIssueComment.mockImplementation(async () => {
      controller.abort()
      return { id: 50 }
    })

    await runReview(trigger(), { logger: silentLogger, signal: controller.signal })

    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    expect(mockCreatePullRequestReview).not.toHaveBeenCalled()
  })
})
