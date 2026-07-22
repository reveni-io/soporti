import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPullRequest = vi.fn()
const mockListIssueComments = vi.fn()
const mockListReviewComments = vi.fn()
const mockCreateIssueComment = vi.fn()
const mockCreateReviewCommentReply = vi.fn()
const mockRunMentionAgent = vi.fn()
const mockAcquireWorkspace = vi.fn()
const mockRelease = vi.fn()

vi.mock('../github/client.js', () => ({
  getPullRequest: mockGetPullRequest,
  listIssueComments: mockListIssueComments,
  listReviewComments: mockListReviewComments,
  createIssueComment: mockCreateIssueComment,
  createReviewCommentReply: mockCreateReviewCommentReply,
}))

vi.mock('./mention-agent.js', () => ({
  runMentionAgent: mockRunMentionAgent,
}))

vi.mock('./workspace.js', () => ({
  acquireWorkspace: mockAcquireWorkspace,
}))

const { runMention } = await import('./mention.js')

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

function mention(overrides = {}) {
  return {
    kind: 'mention',
    channel: 'issue',
    repoFullName: 'acme-io/app',
    prNumber: 7,
    commentId: 100,
    commentBody: '@soporti-bot ¿esto cuadra con la sc-1234?',
    commentAuthor: 'dev',
    dedupeKey: 'acme-io/app#7@mention-100',
    ...overrides,
  }
}

function setupHappyPath() {
  mockGetPullRequest.mockResolvedValue({ title: 'Fix totals', state: 'open', user: { login: 'dev' } })
  mockAcquireWorkspace.mockResolvedValue({ localPath: '/tmp/wt-pr-7', release: mockRelease })
  mockListIssueComments.mockResolvedValue([
    { id: 50, body: 'earlier comment', user: { login: 'alice' } },
    { id: 100, body: '@soporti-bot ¿esto cuadra con la sc-1234?', user: { login: 'dev' } },
  ])
  mockListReviewComments.mockResolvedValue([])
  mockRunMentionAgent.mockResolvedValue('Sí, cuadra: la story pide redondeo al alza.')
  mockCreateIssueComment.mockResolvedValue({ id: 101 })
  mockCreateReviewCommentReply.mockResolvedValue({ id: 201 })
}

describe('runMention', () => {
  beforeEach(() => vi.clearAllMocks())

  it('replies in the PR conversation quoting the triggering comment', async () => {
    setupHappyPath()

    await runMention(mention(), { logger: silentLogger })

    expect(mockCreateIssueComment).toHaveBeenCalledWith(
      'acme-io/app',
      7,
      '> **dev**: @soporti-bot ¿esto cuadra con la sc-1234?\n\nSí, cuadra: la story pide redondeo al alza.'
    )
    expect(mockCreateReviewCommentReply).not.toHaveBeenCalled()
  })

  it('quotes every line of a multi-line comment, normalizing CRLF', async () => {
    setupHappyPath()

    await runMention(mention({ commentBody: '@soporti-bot mira esto:\r\n- caso A\r\n- caso B' }), {
      logger: silentLogger,
    })

    expect(mockCreateIssueComment.mock.calls[0][2]).toBe(
      '> **dev**: @soporti-bot mira esto:\n> - caso A\n> - caso B\n\nSí, cuadra: la story pide redondeo al alza.'
    )
  })

  it('truncates very long comments in the quote', async () => {
    setupHappyPath()

    await runMention(mention({ commentBody: `@soporti-bot ${'x'.repeat(1000)}` }), { logger: silentLogger })

    const [quote] = mockCreateIssueComment.mock.calls[0][2].split('\n\n')
    expect(quote).toMatch(/…$/)
    expect(quote.length).toBeLessThan(400)
  })

  it('hands the agent the PR, the checkout and the thread without the mention itself', async () => {
    setupHappyPath()

    await runMention(mention(), { logger: silentLogger })

    expect(mockRunMentionAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        rootPath: '/tmp/wt-pr-7',
        thread: [expect.objectContaining({ id: 50 })],
      })
    )
  })

  it('replies inside the review thread, scoped to that thread', async () => {
    setupHappyPath()
    mockListReviewComments.mockResolvedValue([
      { id: 150, in_reply_to_id: null, body: 'finding', user: { login: 'soporti-bot' } },
      { id: 160, in_reply_to_id: 150, body: 'reply', user: { login: 'dev' } },
      { id: 200, in_reply_to_id: 150, body: '@soporti-bot ¿seguro?', user: { login: 'dev' } },
      { id: 300, in_reply_to_id: 999, body: 'other thread', user: { login: 'bob' } },
    ])

    await runMention(mention({ channel: 'review_thread', commentId: 200, inReplyToId: 150 }), {
      logger: silentLogger,
    })

    const { thread } = mockRunMentionAgent.mock.calls[0][0]
    expect(thread.map(c => c.id)).toEqual([150, 160])
    expect(mockCreateReviewCommentReply).toHaveBeenCalledWith(
      'acme-io/app',
      7,
      200,
      '> **dev**: @soporti-bot ¿esto cuadra con la sc-1234?\n\nSí, cuadra: la story pide redondeo al alza.'
    )
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
  })

  it('redacts credentials from the reply before posting it', async () => {
    setupHappyPath()
    mockRunMentionAgent.mockResolvedValue('El token es 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, úsalo.')

    await runMention(mention(), { logger: silentLogger })

    const body = mockCreateIssueComment.mock.calls[0][2]
    expect(body).not.toContain('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')
    expect(body).toContain('[redacted]')
  })

  it('still replies when the thread cannot be loaded', async () => {
    setupHappyPath()
    mockListIssueComments.mockRejectedValue(new Error('github down'))

    await runMention(mention(), { logger: silentLogger })

    expect(mockRunMentionAgent).toHaveBeenCalledWith(expect.objectContaining({ thread: [] }))
    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
  })

  it('posts a fallback comment and releases the workspace when the agent fails', async () => {
    setupHappyPath()
    mockRunMentionAgent.mockRejectedValue(new Error('model exploded'))

    await runMention(mention(), { logger: silentLogger })

    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueComment.mock.calls[0][2]).toMatch(/could not/i)
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('keeps the failure notice inside the review thread for review_thread mentions', async () => {
    setupHappyPath()
    mockRunMentionAgent.mockRejectedValue(new Error('model exploded'))

    await runMention(mention({ channel: 'review_thread', commentId: 200, inReplyToId: 150 }), {
      logger: silentLogger,
    })

    expect(mockCreateReviewCommentReply).toHaveBeenCalledTimes(1)
    expect(mockCreateReviewCommentReply.mock.calls[0][2]).toBe(200)
    expect(mockCreateReviewCommentReply.mock.calls[0][3]).toMatch(/could not/i)
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
  })

  it('never throws, even if the fallback comment fails too', async () => {
    setupHappyPath()
    mockGetPullRequest.mockRejectedValue(new Error('404'))
    mockCreateIssueComment.mockRejectedValue(new Error('also down'))

    await expect(runMention(mention(), { logger: silentLogger })).resolves.toBeUndefined()
  })
})
