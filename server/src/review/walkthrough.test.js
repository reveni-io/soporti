import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateIssueComment = vi.fn()
const mockListIssueComments = vi.fn()
const mockUpdateIssueComment = vi.fn()

vi.mock('../github/client.js', () => ({
  createIssueComment: mockCreateIssueComment,
  listIssueComments: mockListIssueComments,
  updateIssueComment: mockUpdateIssueComment,
}))

const { upsertWalkthrough } = await import('./walkthrough.js')

const BODY = '<!-- soporti:walkthrough -->\n## 📝 Walkthrough\n\nNew walkthrough.'

function comment(id, login, body) {
  return { id, user: { login }, body }
}

describe('upsertWalkthrough', () => {
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateIssueComment.mockResolvedValue({ id: 900 })
    mockUpdateIssueComment.mockResolvedValue({ id: 500 })
  })

  it('creates the walkthrough when the PR has none of the reviewer', async () => {
    mockListIssueComments.mockResolvedValue([
      comment(1, 'dev', 'Quoting <!-- soporti:walkthrough --> here.'),
      comment(2, 'soporti-bot', 'A reply without the marker.'),
    ])

    await upsertWalkthrough(
      { repoFullName: 'acme-io/app', prNumber: 7, reviewerLogin: 'soporti-bot', body: BODY },
      { logger }
    )

    expect(mockListIssueComments).toHaveBeenCalledWith('acme-io/app', 7)
    expect(mockUpdateIssueComment).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueComment).toHaveBeenCalledWith('acme-io/app', 7, BODY)
  })

  it("edits the reviewer's own walkthrough in place", async () => {
    mockListIssueComments.mockResolvedValue([
      comment(1, 'dev', 'LGTM'),
      comment(500, 'Soporti-Bot[bot]', '<!-- soporti:walkthrough -->\n## 📝 Walkthrough\n\nOld walkthrough.'),
    ])

    await upsertWalkthrough(
      { repoFullName: 'acme-io/app', prNumber: 7, reviewerLogin: 'soporti-bot', body: BODY },
      { logger }
    )

    expect(mockUpdateIssueComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateIssueComment).toHaveBeenCalledWith('acme-io/app', 500, BODY)
    expect(mockCreateIssueComment).not.toHaveBeenCalled()
  })

  it('creates a new walkthrough when the one it found was deleted before the edit', async () => {
    mockListIssueComments.mockResolvedValue([comment(500, 'soporti-bot', '<!-- soporti:walkthrough -->')])
    mockUpdateIssueComment.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))

    await upsertWalkthrough(
      { repoFullName: 'acme-io/app', prNumber: 7, reviewerLogin: 'soporti-bot', body: BODY },
      { logger }
    )

    expect(mockUpdateIssueComment).toHaveBeenCalledWith('acme-io/app', 500, BODY)
    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueComment).toHaveBeenCalledWith('acme-io/app', 7, BODY)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('creates a walkthrough without looking for one when the reviewer login is unknown', async () => {
    await upsertWalkthrough({ repoFullName: 'acme-io/app', prNumber: 7, reviewerLogin: null, body: BODY }, { logger })

    expect(mockListIssueComments).not.toHaveBeenCalled()
    expect(mockCreateIssueComment).toHaveBeenCalledTimes(1)
    expect(mockCreateIssueComment).toHaveBeenCalledWith('acme-io/app', 7, BODY)
  })

  it('logs a failed edit without posting a duplicate walkthrough', async () => {
    mockListIssueComments.mockResolvedValue([comment(500, 'soporti-bot', '<!-- soporti:walkthrough -->')])
    mockUpdateIssueComment.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 500 }))

    await upsertWalkthrough(
      { repoFullName: 'acme-io/app', prNumber: 7, reviewerLogin: 'soporti-bot', body: BODY },
      { logger }
    )

    expect(mockCreateIssueComment).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      '[review] Could not post the walkthrough on acme-io/app#7 (Server Error); posting the review anyway'
    )
  })

  it('never throws when the walkthrough cannot be posted', async () => {
    mockCreateIssueComment.mockRejectedValue(new Error('Forbidden'))

    await expect(
      upsertWalkthrough({ repoFullName: 'acme-io/app', prNumber: 7, reviewerLogin: null, body: BODY }, { logger })
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      '[review] Could not post the walkthrough on acme-io/app#7 (Forbidden); posting the review anyway'
    )
  })
})
