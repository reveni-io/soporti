import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const callSlack = vi.fn()
vi.mock('./client.js', () => ({ callSlack }))

const { listPublicChannels, readChannelHistory, readThread, MAX_MESSAGE_CHARS, _resetSlackChannelCacheForTests } =
  await import('./channels.js')

const NOT_PUBLIC = /Soporti only reads public Slack channels/

function publicChannel(id, name, extra = {}) {
  return { id, name, is_channel: true, is_private: false, is_im: false, is_mpim: false, ...extra }
}

function routeSlack(responses) {
  callSlack.mockImplementation(async (method, params) => {
    const response = responses[method]
    if (!response) throw new Error(`Unexpected Slack call: ${method}`)

    return typeof response === 'function' ? response(params) : response
  })
}

function callsTo(method) {
  return callSlack.mock.calls.filter(([name]) => name === method).map(([, params]) => params)
}

beforeEach(() => {
  callSlack.mockReset()
  _resetSlackChannelCacheForTests()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('listPublicChannels', () => {
  it('lists the public channels by name with their topic, purpose, size and whether the bot is in them', async () => {
    routeSlack({
      'conversations.list': {
        channels: [
          publicChannel('C0000000002', 'support', {
            topic: { value: 'Customer questions' },
            purpose: { value: '' },
            num_members: 12,
            is_member: true,
          }),
          publicChannel('C0000000001', 'incidents', { topic: { value: '' }, purpose: { value: 'Outages' } }),
          publicChannel('C0000000003', 'secret-plans', { is_private: true }),
        ],
      },
    })

    const result = await listPublicChannels()

    expect(result).toEqual({
      channels: [
        {
          id: 'C0000000001',
          name: 'incidents',
          topic: null,
          purpose: 'Outages',
          members: null,
          botIsMember: false,
        },
        {
          id: 'C0000000002',
          name: 'support',
          topic: 'Customer questions',
          purpose: null,
          members: 12,
          botIsMember: true,
        },
      ],
      total: 2,
      hasMore: false,
    })
    expect(callsTo('conversations.list')).toEqual([
      { types: 'public_channel', exclude_archived: 'true', limit: '1000', cursor: null },
    ])
  })

  it('follows the cursor until Slack has no more pages', async () => {
    routeSlack({
      'conversations.list': params =>
        params.cursor
          ? { channels: [publicChannel('C0000000002', 'beta')] }
          : { channels: [publicChannel('C0000000001', 'alpha')], response_metadata: { next_cursor: 'page-2' } },
    })

    const result = await listPublicChannels()

    expect(result.channels.map(channel => channel.name)).toEqual(['alpha', 'beta'])
    expect(callsTo('conversations.list').map(params => params.cursor)).toEqual([null, 'page-2'])
  })

  it('finds channels by part of the name, topic or purpose, ignoring a leading #', async () => {
    routeSlack({
      'conversations.list': {
        channels: [
          publicChannel('C0000000001', 'inc-payments'),
          publicChannel('C0000000002', 'support', { topic: { value: 'Incident follow-ups' } }),
          publicChannel('C0000000003', 'random', { purpose: { value: 'Anything goes' } }),
        ],
      },
    })

    const byName = await listPublicChannels({ query: '#INC' })
    const byPurpose = await listPublicChannels({ query: 'anything' })

    expect(byName.channels.map(channel => channel.name)).toEqual(['inc-payments', 'support'])
    expect(byPurpose.channels.map(channel => channel.name)).toEqual(['random'])
  })

  it('caps the list at the limit and says more channels matched', async () => {
    routeSlack({
      'conversations.list': {
        channels: [
          publicChannel('C0000000001', 'a'),
          publicChannel('C0000000002', 'b'),
          publicChannel('C0000000003', 'c'),
        ],
      },
    })

    const result = await listPublicChannels({ limit: 2 })

    expect(result.channels.map(channel => channel.name)).toEqual(['a', 'b'])
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(true)
  })

  it('reuses the channel list for a minute before asking Slack again', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'))
    routeSlack({ 'conversations.list': { channels: [publicChannel('C0000000001', 'support')] } })

    await listPublicChannels()
    await listPublicChannels({ query: 'sup' })
    vi.setSystemTime(new Date('2026-11-18T10:01:01Z'))
    await listPublicChannels()

    expect(callsTo('conversations.list')).toHaveLength(2)
  })
})

describe('readChannelHistory', () => {
  it('resolves a channel name and returns its messages with their author, local time and link', async () => {
    routeSlack({
      'conversations.list': { channels: [publicChannel('C0000000001', 'support')] },
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.history': {
        messages: [
          { ts: '1700000060.000200', user: 'U0000000001', text: 'Fixed it' },
          { ts: '1700000000.000100', bot_profile: { name: 'Sentry' }, text: 'New issue' },
        ],
        has_more: true,
        response_metadata: { next_cursor: 'older' },
      },
      'users.info': { user: { name: 'ana', profile: { display_name: '', real_name: 'Ana García' } } },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const result = await readChannelHistory('#Support', {
      timeMin: '2023-11-14T00:00:00.000Z',
      timeMax: '2023-11-15T00:00:00.000Z',
      limit: 20,
      timeZone: 'Europe/Madrid',
    })

    expect(result).toEqual({
      channel: { id: 'C0000000001', name: 'support' },
      messages: [
        {
          ts: '1700000060.000200',
          time: '2023-11-14T23:14:20+01:00',
          author: 'Ana García',
          text: 'Fixed it',
          url: 'https://acme.slack.com/archives/C0000000001/p1700000060000200',
        },
        {
          ts: '1700000000.000100',
          time: '2023-11-14T23:13:20+01:00',
          author: 'Sentry',
          text: 'New issue',
          url: 'https://acme.slack.com/archives/C0000000001/p1700000000000100',
        },
      ],
      hasMore: true,
      nextCursor: 'older',
    })
    expect(callsTo('conversations.history')).toEqual([
      {
        channel: 'C0000000001',
        oldest: '1699920000.000000',
        latest: '1700006400.000000',
        limit: '20',
        cursor: null,
      },
    ])
    expect(callsTo('users.info')).toEqual([{ user: 'U0000000001' }])
  })

  it('reads a channel given by id or by mention without listing the channels', async () => {
    routeSlack({
      'conversations.info': params => ({ channel: publicChannel(params.channel, 'support') }),
      'conversations.history': { messages: [] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const byId = await readChannelHistory('C0000000001')
    const byMention = await readChannelHistory('<#C0000000002|support>')

    expect(byId.channel).toEqual({ id: 'C0000000001', name: 'support' })
    expect(byMention.channel).toEqual({ id: 'C0000000002', name: 'support' })
    expect(callsTo('conversations.list')).toHaveLength(0)
    expect(callsTo('conversations.history').map(params => params.channel)).toEqual(['C0000000001', 'C0000000002'])
  })

  it('refuses private channels and group messages that Slack describes', async () => {
    routeSlack({
      'conversations.info': params =>
        params.channel === 'C0000000001'
          ? { channel: publicChannel('C0000000001', 'leadership', { is_private: true }) }
          : { channel: publicChannel('C0000000002', 'mpdm-ana--luis-1', { is_mpim: true }) },
      'conversations.history': { messages: [] },
    })

    await expect(readChannelHistory('C0000000001')).rejects.toThrow(NOT_PUBLIC)
    await expect(readChannelHistory('C0000000002')).rejects.toThrow(NOT_PUBLIC)
    expect(callsTo('conversations.history')).toHaveLength(0)
  })

  it('refuses direct message and legacy private ids without calling Slack', async () => {
    await expect(readChannelHistory('D0123ABCDE')).rejects.toThrow(NOT_PUBLIC)
    await expect(readChannelHistory('<#G0123ABCDE|old-private>')).rejects.toThrow(NOT_PUBLIC)
    expect(callSlack).not.toHaveBeenCalled()
  })

  it('says there is no public channel with that name', async () => {
    routeSlack({ 'conversations.list': { channels: [publicChannel('C0000000001', 'support')] } })

    await expect(readChannelHistory('#leadership')).rejects.toThrow(
      'There is no public Slack channel named #leadership.'
    )
    await expect(readChannelHistory('  ')).rejects.toThrow('A Slack channel name or id is required.')
    expect(callsTo('conversations.info')).toHaveLength(0)
  })

  it('shows mentions by name, includes attachment text and file names, and redacts secrets', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.history': {
        messages: [
          {
            ts: '1700000000.000100',
            user: 'U0000000001',
            text: '<!here> <@U0000000002> see <#C0000000003|incidents>, ping <!subteam^S0001|@oncall>, token xoxb-1234567890-abcdefghij',
            attachments: [
              { title: 'Error in checkout', text: 'TypeError: x is undefined' },
              { fallback: 'Deploy done' },
            ],
            files: [{ name: 'screenshot.png' }, { title: 'Notes' }],
          },
        ],
      },
      'users.info': params => ({
        user: { profile: { display_name: params.user === 'U0000000001' ? 'ana' : 'luis' } },
      }),
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const [message] = (await readChannelHistory('C0000000001')).messages

    expect(message.author).toBe('ana')
    expect(message.text).toBe(
      '@here @luis see #incidents, ping @oncall, token [redacted]\nError in checkout\nTypeError: x is undefined\nDeploy done'
    )
    expect(message.files).toEqual(['screenshot.png', 'Notes'])
  })

  it('leaves out join and leave notices and marks thread starters with their reply count', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.history': {
        messages: [
          { ts: '1700000300.000100', subtype: 'channel_join', user: 'U0000000001', text: 'joined' },
          { ts: '1700000200.000100', subtype: 'channel_leave', user: 'U0000000001', text: 'left' },
          {
            ts: '1700000100.000100',
            username: 'deploy-bot',
            text: 'Deploying',
            thread_ts: '1700000100.000100',
            reply_count: 3,
          },
        ],
      },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const { messages } = await readChannelHistory('C0000000001')

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ author: 'deploy-bot', replies: 3 })
    expect(messages[0].url).toBe('https://acme.slack.com/archives/C0000000001/p1700000100000100')
  })

  it('cuts a very long message and marks it truncated', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.history': { messages: [{ ts: '1700000000.000100', text: 'a'.repeat(MAX_MESSAGE_CHARS + 10) }] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const [message] = (await readChannelHistory('C0000000001')).messages

    expect(message.text).toHaveLength(MAX_MESSAGE_CHARS)
    expect(message.truncated).toBe(true)
    expect(message.author).toBe('unknown')
  })

  it('falls back to the user id and no link when the user and workspace lookups fail', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.history': { messages: [{ ts: '1700000000.000100', user: 'U0000000001', text: 'hi' }] },
      'users.info': () => {
        throw new Error('The Slack app is missing the users:read scope.')
      },
      'auth.test': () => {
        throw new Error('Slack API auth.test failed: invalid_auth.')
      },
    })

    const [message] = (await readChannelHistory('C0000000001')).messages

    expect(message).toMatchObject({ author: 'U0000000001', url: null })
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('lets a Slack refusal through, such as a bot that is not in the channel', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.history': () => {
        throw new Error('The Soporti bot is not a member of this channel.')
      },
    })

    await expect(readChannelHistory('C0000000001')).rejects.toThrow('The Soporti bot is not a member of this channel.')
  })

  it('asks Slack with read-specific explanations for the errors it knows', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.history': { messages: [] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    await readChannelHistory('C0000000001')

    const [, , errorMessages] = callSlack.mock.calls.find(([method]) => method === 'conversations.history')
    expect(errorMessages.not_in_channel).toMatch(/add it first with \/invite/)
    expect(errorMessages.channel_not_found).toMatch(/only reads public channels/)
  })
})

describe('readThread', () => {
  it('reads a whole thread from the ts of a message link, with reply links that open the thread', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.replies': {
        messages: [
          { ts: '1700000000.123456', thread_ts: '1700000000.123456', reply_count: 1, user: 'U0000000001', text: 'Q' },
          { ts: '1700000100.000100', thread_ts: '1700000000.123456', user: 'U0000000001', text: 'A' },
        ],
      },
      'users.info': { user: { profile: { display_name: 'ana' } } },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const result = await readThread('C0000000001', 'p1700000000123456', { limit: 10, cursor: 'next' })

    expect(callsTo('conversations.replies')).toEqual([
      { channel: 'C0000000001', ts: '1700000000.123456', limit: '10', cursor: 'next' },
    ])
    expect(result.messages.map(message => message.url)).toEqual([
      'https://acme.slack.com/archives/C0000000001/p1700000000123456',
      'https://acme.slack.com/archives/C0000000001/p1700000100000100?thread_ts=1700000000.123456&cid=C0000000001',
    ])
    expect(result.messages[0].replies).toBe(1)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  it('accepts a plain ts', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.replies': { messages: [] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    await readThread('C0000000001', ' 1700000000.123456 ')

    expect(callsTo('conversations.replies')[0]).toMatchObject({ ts: '1700000000.123456', limit: '100' })
  })

  it('rejects something that is not a message ts without calling Slack', async () => {
    await expect(readThread('C0000000001', 'yesterday')).rejects.toThrow('"yesterday" is not a Slack message ts.')
    expect(callSlack).not.toHaveBeenCalled()
  })

  it('refuses a thread in a private channel', async () => {
    routeSlack({ 'conversations.info': { channel: publicChannel('C0000000001', 'hr', { is_private: true }) } })

    await expect(readThread('C0000000001', '1700000000.123456')).rejects.toThrow(NOT_PUBLIC)
    expect(callsTo('conversations.replies')).toHaveLength(0)
  })
})
