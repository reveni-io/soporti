import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSlackBotToken = vi.fn()
vi.mock('./settings.js', () => ({ getSlackBotToken }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { postMessage } = await import('./client.js')

function slackResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data }
}

function postedResponse() {
  return slackResponse({ ok: true, channel: 'C0123ABCD', ts: '1730000000.000100' })
}

function permalinkResponse() {
  return slackResponse({
    ok: true,
    channel: 'C0123ABCD',
    permalink: 'https://acme.slack.com/archives/C0123ABCD/p1730000000000100',
  })
}

function sentParams(callIndex) {
  return Object.fromEntries(mockFetch.mock.calls[callIndex][1].body)
}

beforeEach(() => {
  mockFetch.mockReset()
  getSlackBotToken.mockReset().mockResolvedValue('xoxb-test-token')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('postMessage', () => {
  it('posts the markdown to the channel with the bot token and returns the permalink', async () => {
    mockFetch.mockResolvedValueOnce(postedResponse()).mockResolvedValueOnce(permalinkResponse())

    const result = await postMessage('#support', '**3 new issues** since yesterday')

    expect(result).toEqual({
      channel: 'C0123ABCD',
      ts: '1730000000.000100',
      permalink: 'https://acme.slack.com/archives/C0123ABCD/p1730000000000100',
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][0]).toBe('https://slack.com/api/chat.postMessage')
    expect(mockFetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer xoxb-test-token' })
    expect(sentParams(0)).toEqual({ channel: '#support', markdown_text: '**3 new issues** since yesterday' })
    expect(mockFetch.mock.calls[1][0]).toBe('https://slack.com/api/chat.getPermalink')
    expect(sentParams(1)).toEqual({ channel: 'C0123ABCD', message_ts: '1730000000.000100' })
  })

  it('adds the leading # to a bare channel name and lowercases it', async () => {
    mockFetch.mockResolvedValueOnce(postedResponse()).mockResolvedValueOnce(permalinkResponse())

    await postMessage('  Support ', 'hello')

    expect(sentParams(0).channel).toBe('#support')
  })

  it('passes a channel id through untouched', async () => {
    mockFetch.mockResolvedValueOnce(postedResponse()).mockResolvedValueOnce(permalinkResponse())

    await postMessage('C0123ABCD', 'hello')

    expect(sentParams(0).channel).toBe('C0123ABCD')
  })

  it('redacts credential-shaped strings before posting', async () => {
    mockFetch.mockResolvedValueOnce(postedResponse()).mockResolvedValueOnce(permalinkResponse())

    await postMessage('#support', 'the token is ghp_abcdefghijklmnopqrstuvwxyz123456')

    expect(sentParams(0).markdown_text).toBe('the token is [redacted]')
  })

  it('still reports the posted message when the permalink cannot be fetched', async () => {
    mockFetch.mockResolvedValueOnce(postedResponse()).mockResolvedValueOnce(slackResponse({ ok: false, error: 'boom' }))

    const result = await postMessage('#support', 'hello')

    expect(result).toEqual({ channel: 'C0123ABCD', ts: '1730000000.000100', permalink: null })
  })

  it('explains that the bot has to be invited when it is not in the channel', async () => {
    mockFetch.mockResolvedValueOnce(slackResponse({ ok: false, error: 'not_in_channel' }))

    await expect(postMessage('#private-team', 'hello')).rejects.toThrow(/has to invite it first/)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('explains that the channel cannot be found', async () => {
    mockFetch.mockResolvedValueOnce(slackResponse({ ok: false, error: 'channel_not_found' }))

    await expect(postMessage('#nope', 'hello')).rejects.toThrow(/cannot find this channel/)
  })

  it('names the raw Slack error code it has no message for', async () => {
    mockFetch.mockResolvedValueOnce(slackResponse({ ok: false, error: 'rate_limited' }))

    await expect(postMessage('#support', 'hello')).rejects.toThrow('Slack API chat.postMessage failed: rate_limited.')
  })

  it('fails on an HTTP error status', async () => {
    mockFetch.mockResolvedValueOnce(slackResponse({}, { ok: false, status: 503 }))

    await expect(postMessage('#support', 'hello')).rejects.toThrow('Slack API chat.postMessage failed (503).')
  })

  it('refuses an empty message or channel without calling Slack', async () => {
    await expect(postMessage('#support', '   ')).rejects.toThrow('A Slack message needs some text.')
    await expect(postMessage('#', 'hello')).rejects.toThrow('A Slack channel name or id is required.')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refuses a message longer than Slack accepts', async () => {
    await expect(postMessage('#support', 'a'.repeat(12_001))).rejects.toThrow(/at most 12000/)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('asks to configure Slack when there is no bot token', async () => {
    getSlackBotToken.mockResolvedValue(null)

    await expect(postMessage('#support', 'hello')).rejects.toThrow(/Slack is not configured/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
