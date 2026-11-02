import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', () => ({ default: { publicUrl: 'https://soporti.acme.com' } }))
vi.mock('../db/users.js', () => ({ findUserById: vi.fn() }))
vi.mock('../slack/settings.js', () => ({ isSlackConfigured: vi.fn() }))
vi.mock('../slack/client.js', () => ({ postDirectMessage: vi.fn() }))

const { findUserById } = await import('../db/users.js')
const { isSlackConfigured } = await import('../slack/settings.js')
const { postDirectMessage } = await import('../slack/client.js')
const { notifyVersionOutcome } = await import('./notify.js')

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const JOB = { videoId: VIDEO_ID, version: 2, video: { userId: 7, title: 'Refunds in one click' } }

beforeEach(() => {
  vi.clearAllMocks()
  isSlackConfigured.mockResolvedValue(true)
  findUserById.mockResolvedValue({ id: 7, slackId: 'U0123ABCD', email: 'ana@acme.com' })
  postDirectMessage.mockResolvedValue({ channel: 'D1', ts: '1' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('notifyVersionOutcome', () => {
  it('DMs the owner the title, the version, the duration and the link when a version is ready', async () => {
    const sent = await notifyVersionOutcome({ job: JOB, status: 'ready', durationMs: 62_000 })

    expect(sent).toBe(true)
    expect(postDirectMessage).toHaveBeenCalledTimes(1)
    expect(postDirectMessage).toHaveBeenCalledWith(
      { slackId: 'U0123ABCD', email: 'ana@acme.com' },
      `Your video *Refunds in one click* is ready: version 2, 1:02.\nhttps://soporti.acme.com/videos/${VIDEO_ID}`
    )
  })

  it('DMs a Slack-only owner by their Slack id', async () => {
    findUserById.mockResolvedValue({ id: 7, slackId: 'U0999ZZZZ', email: null })

    const sent = await notifyVersionOutcome({ job: JOB, status: 'ready', durationMs: 7000 })

    expect(sent).toBe(true)
    expect(findUserById).toHaveBeenCalledWith(7)
    expect(postDirectMessage).toHaveBeenCalledTimes(1)
    expect(postDirectMessage.mock.calls[0][0]).toEqual({ slackId: 'U0999ZZZZ', email: null })
  })

  it('DMs the failure in one sentence when a version fails', async () => {
    await notifyVersionOutcome({ job: JOB, status: 'failed', error: 'The page threw on boot.' })

    expect(postDirectMessage).toHaveBeenCalledWith(
      { slackId: 'U0123ABCD', email: 'ana@acme.com' },
      `Version 2 of your video *Refunds in one click* failed: The page threw on boot.\nhttps://soporti.acme.com/videos/${VIDEO_ID}`
    )
  })

  it('logs and skips when Slack is not configured', async () => {
    isSlackConfigured.mockResolvedValue(false)

    const sent = await notifyVersionOutcome({ job: JOB, status: 'ready', durationMs: 1000 })

    expect(sent).toBe(false)
    expect(findUserById).not.toHaveBeenCalled()
    expect(postDirectMessage).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Slack is not configured'))
  })

  it('logs and skips when the owner has neither a Slack id nor an email', async () => {
    findUserById.mockResolvedValue({ id: 7, slackId: null, email: null })

    const sent = await notifyVersionOutcome({ job: JOB, status: 'ready', durationMs: 1000 })

    expect(sent).toBe(false)
    expect(postDirectMessage).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('has no Slack id or email'))
  })

  it('logs and skips when Slack cannot find the owner', async () => {
    postDirectMessage.mockRejectedValue(new Error('No Slack user has that email address.'))

    const sent = await notifyVersionOutcome({ job: JOB, status: 'ready', durationMs: 1000 })

    expect(sent).toBe(false)
    expect(console.log).toHaveBeenCalledWith(
      `[videos] Could not DM the owner of video ${VIDEO_ID} on Slack: No Slack user has that email address.`
    )
  })
})
