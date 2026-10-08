import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpdateReviewComment = vi.fn()
const mockResolveReviewThread = vi.fn()

vi.mock('../github/client.js', () => ({
  updateReviewComment: mockUpdateReviewComment,
  resolveReviewThread: mockResolveReviewThread,
}))

const { selectFixedThreads, resolveFixedThreads } = await import('./fixed-threads.js')

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

function openThread(ref, overrides = {}) {
  return {
    ref,
    id: `PRRT_${ref}`,
    commentId: `42${ref.slice(1)}`,
    body: `**Major**\n\n**Finding ${ref}.**\n`,
    ...overrides,
  }
}

function request(threads) {
  return { repoFullName: 'acme-io/app', prNumber: 7, headSha: 'cafe1234beef', threads }
}

describe('selectFixedThreads', () => {
  it('picks the reviewer own open threads whose ref the overview listed as fixed', () => {
    const history = { openThreads: [openThread('T1'), openThread('T2'), openThread('T3')] }

    const threads = selectFixedThreads({ fixedThreads: ['T3', 'T1'] }, history)

    expect(threads).toEqual([openThread('T1'), openThread('T3')])
  })

  it('ignores refs that match no open thread of the reviewer and refs listed twice', () => {
    const history = { openThreads: [openThread('T1')] }

    const threads = selectFixedThreads({ fixedThreads: ['T1', 'T1', 'T7', 't1', 'PRRT_T1'] }, history)

    expect(threads).toEqual([openThread('T1')])
  })

  it('selects nothing without an overview or a review history', () => {
    expect(selectFixedThreads(null, { openThreads: [openThread('T1')] })).toEqual([])
    expect(selectFixedThreads({ fixedThreads: ['T1'] }, null)).toEqual([])
  })
})

describe('resolveFixedThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReviewComment.mockResolvedValue({})
    mockResolveReviewThread.mockResolvedValue(undefined)
  })

  it('marks each root comment as addressed in the head commit, then resolves its thread', async () => {
    await resolveFixedThreads(request([openThread('T1'), openThread('T2')]), { logger: silentLogger })

    expect(mockUpdateReviewComment).toHaveBeenCalledTimes(2)
    expect(mockUpdateReviewComment).toHaveBeenNthCalledWith(
      1,
      'acme-io/app',
      '421',
      '**Major**\n\n**Finding T1.**\n\n✅ Addressed in commit `cafe123`'
    )
    expect(mockResolveReviewThread).toHaveBeenCalledTimes(2)
    expect(mockResolveReviewThread.mock.calls).toEqual([['PRRT_T1'], ['PRRT_T2']])
    expect(mockUpdateReviewComment.mock.invocationCallOrder[0]).toBeLessThan(
      mockResolveReviewThread.mock.invocationCallOrder[0]
    )
  })

  it('does not append the note again to a comment that already says it was addressed', async () => {
    const thread = openThread('T1', { body: '**Finding.**\n\n✅ Addressed in commit `0ld0000`' })

    await resolveFixedThreads(request([thread]), { logger: silentLogger })

    expect(mockUpdateReviewComment).not.toHaveBeenCalled()
    expect(mockResolveReviewThread).toHaveBeenCalledTimes(1)
    expect(mockResolveReviewThread).toHaveBeenCalledWith('PRRT_T1')
  })

  it('redacts credentials from the edited comment', async () => {
    const thread = openThread('T1', { body: 'Connects with postgres://app:s3cr3t@db.internal/app' })

    await resolveFixedThreads(request([thread]), { logger: silentLogger })

    const [[, , body]] = mockUpdateReviewComment.mock.calls
    expect(body).not.toContain('s3cr3t')
    expect(body).toContain('postgres://[redacted]@db.internal/app')
  })

  it('leaves a thread open when its comment cannot be edited, logs it and moves on', async () => {
    mockUpdateReviewComment.mockRejectedValueOnce(new Error('Not Found'))

    await resolveFixedThreads(request([openThread('T1'), openThread('T2')]), { logger: silentLogger })

    expect(mockResolveReviewThread).toHaveBeenCalledTimes(1)
    expect(mockResolveReviewThread).toHaveBeenCalledWith('PRRT_T2')
    expect(silentLogger.warn).toHaveBeenCalledWith(
      '[review] Could not resolve the fixed thread T1 on acme-io/app#7 (Not Found)'
    )
  })

  it('logs a thread that cannot be resolved and still resolves the next one', async () => {
    mockResolveReviewThread.mockRejectedValueOnce(new Error('Resource not accessible by integration'))

    await resolveFixedThreads(request([openThread('T1'), openThread('T2')]), { logger: silentLogger })

    expect(mockResolveReviewThread).toHaveBeenCalledTimes(2)
    expect(silentLogger.warn).toHaveBeenCalledTimes(1)
    expect(silentLogger.warn).toHaveBeenCalledWith(
      '[review] Could not resolve the fixed thread T1 on acme-io/app#7 (Resource not accessible by integration)'
    )
  })

  it('resolves nothing once a newer review supersedes this one', async () => {
    const controller = new AbortController()
    controller.abort()

    await resolveFixedThreads(request([openThread('T1')]), { logger: silentLogger, signal: controller.signal })

    expect(mockUpdateReviewComment).not.toHaveBeenCalled()
    expect(mockResolveReviewThread).not.toHaveBeenCalled()
    expect(silentLogger.log).toHaveBeenCalledWith('[review] Superseded acme-io/app#7: leaving its fixed threads open')
  })

  it('stops between threads when a newer review supersedes this one', async () => {
    const controller = new AbortController()
    mockResolveReviewThread.mockImplementationOnce(async () => controller.abort())

    await resolveFixedThreads(request([openThread('T1'), openThread('T2')]), {
      logger: silentLogger,
      signal: controller.signal,
    })

    expect(mockResolveReviewThread).toHaveBeenCalledTimes(1)
    expect(mockResolveReviewThread).toHaveBeenCalledWith('PRRT_T1')
    expect(mockUpdateReviewComment).toHaveBeenCalledTimes(1)
  })
})
