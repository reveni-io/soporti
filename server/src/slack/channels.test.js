import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const callSlack = vi.fn()
vi.mock('./client.js', () => ({ callSlack }))

const findUserById = vi.fn()
vi.mock('../db/users.js', () => ({ findUserById }))

const { listChannels, readChannelHistory, readThread, MAX_MESSAGE_CHARS, _resetSlackChannelCacheForTests } =
  await import('./channels.js')

const DIRECT_OR_GROUP = 'This conversation is a direct message or a group message. Soporti never reads them.'
const NOT_A_MEMBER = /the person asking is not a member of it/
const NO_IDENTITY = /cannot match the person asking to a Slack user/
const SHARED_THREAD = /everyone in this Slack conversation would read the answer/
const MEMBER = { userId: 7 }

function publicChannel(id, name, extra = {}) {
  return { id, name, is_channel: true, is_private: false, is_im: false, is_mpim: false, ...extra }
}

function privateChannel(id, name, extra = {}) {
  return { id, name, is_channel: true, is_private: true, is_im: false, is_mpim: false, is_member: true, ...extra }
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

function listByType({ publicChannels = [], privateChannels = [] }) {
  return params => ({ channels: params.types === 'private_channel' ? privateChannels : publicChannels })
}

beforeEach(() => {
  callSlack.mockReset()
  findUserById.mockReset().mockResolvedValue({ id: 7, email: null, slackId: 'U0000000001' })
  _resetSlackChannelCacheForTests()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('listChannels', () => {
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
          privateChannel('C0000000003', 'secret-plans'),
        ],
      },
    })

    const result = await listChannels()

    expect(result).toEqual({
      channels: [
        {
          id: 'C0000000001',
          name: 'incidents',
          private: false,
          topic: null,
          purpose: 'Outages',
          members: null,
          botIsMember: false,
        },
        {
          id: 'C0000000002',
          name: 'support',
          private: false,
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
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('follows the cursor until Slack has no more pages', async () => {
    routeSlack({
      'conversations.list': params =>
        params.cursor
          ? { channels: [publicChannel('C0000000002', 'beta')] }
          : { channels: [publicChannel('C0000000001', 'alpha')], response_metadata: { next_cursor: 'page-2' } },
    })

    const result = await listChannels()

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

    const byName = await listChannels({ query: '#INC' })
    const byPurpose = await listChannels({ query: 'anything' })

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

    const result = await listChannels({ limit: 2 })

    expect(result.channels.map(channel => channel.name)).toEqual(['a', 'b'])
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(true)
  })

  it('reuses the channel list for a minute before asking Slack again', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'))
    routeSlack({ 'conversations.list': { channels: [publicChannel('C0000000001', 'support')] } })

    await listChannels()
    await listChannels({ query: 'sup' })
    vi.setSystemTime(new Date('2026-11-18T10:01:01Z'))
    await listChannels()

    expect(callsTo('conversations.list')).toHaveLength(2)
  })

  it('adds the private channels that the bot shares with the person asking, and only those', async () => {
    routeSlack({
      'conversations.list': listByType({
        publicChannels: [publicChannel('C0000000001', 'support')],
        privateChannels: [
          privateChannel('C0000000002', 'squad-returns'),
          privateChannel('C0000000003', 'leadership'),
          privateChannel('G0000000004', 'mpdm-ana--luis-1', { is_mpim: true }),
        ],
      }),
      'conversations.members': params => ({
        members: params.channel === 'C0000000002' ? ['U0000000001', 'U0000000009'] : ['U0000000009'],
      }),
    })

    const result = await listChannels({ viewer: MEMBER })

    expect(result.channels.map(channel => [channel.name, channel.private])).toEqual([
      ['squad-returns', true],
      ['support', false],
    ])
    expect(findUserById).toHaveBeenCalledWith(7)
    expect(callsTo('conversations.list').map(params => params.types)).toEqual(['public_channel', 'private_channel'])
    expect(callsTo('conversations.members').map(params => params.channel)).toEqual(['C0000000003', 'C0000000002'])
  })

  it('finds the person asking in Slack by their email when they have no Slack account in Soporti', async () => {
    findUserById.mockResolvedValue({ id: 7, email: 'ana@acme.com', slackId: null })
    routeSlack({
      'conversations.list': listByType({ privateChannels: [privateChannel('C0000000002', 'squad-returns')] }),
      'conversations.members': { members: ['U0000000001'] },
      'users.lookupByEmail': { user: { id: 'U0000000001' } },
    })

    const result = await listChannels({ viewer: MEMBER })

    expect(result.channels.map(channel => channel.name)).toEqual(['squad-returns'])
    expect(callsTo('users.lookupByEmail')).toEqual([{ email: 'ana@acme.com' }])
  })

  it('lists no private channel for someone Slack does not know or for a run with nobody behind it', async () => {
    findUserById.mockResolvedValue({ id: 7, email: 'ghost@acme.com', slackId: null })
    routeSlack({
      'conversations.list': listByType({
        publicChannels: [publicChannel('C0000000001', 'support')],
        privateChannels: [privateChannel('C0000000002', 'squad-returns')],
      }),
      'users.lookupByEmail': () => {
        throw new Error('No Slack user has that email address.')
      },
    })

    const unknown = await listChannels({ viewer: MEMBER })
    const nobody = await listChannels({ viewer: { userId: null } })

    expect(unknown.channels.map(channel => channel.name)).toEqual(['support'])
    expect(nobody.channels.map(channel => channel.name)).toEqual(['support'])
    expect(callsTo('conversations.list').map(params => params.types)).toEqual(['public_channel'])
  })

  it('lists from a Slack channel thread only that same private channel, and every shared one from a DM', async () => {
    routeSlack({
      'conversations.list': listByType({
        privateChannels: [privateChannel('C0000000002', 'squad-returns'), privateChannel('C0000000003', 'squad-core')],
      }),
      'conversations.members': { members: ['U0000000001'] },
    })

    const fromPublicThread = await listChannels({ viewer: { userId: 7, slackChannelId: 'C0000000009' } })
    const fromSameChannel = await listChannels({ viewer: { userId: 7, slackChannelId: 'C0000000002' } })
    const fromDirectMessage = await listChannels({ viewer: { userId: 7, slackChannelId: 'D0000000009' } })

    expect(fromPublicThread.channels).toEqual([])
    expect(fromSameChannel.channels.map(channel => channel.name)).toEqual(['squad-returns'])
    expect(fromDirectMessage.channels.map(channel => channel.name)).toEqual(['squad-core', 'squad-returns'])
  })

  it('still lists the public channels, with a notice, when the private ones cannot be listed', async () => {
    routeSlack({
      'conversations.list': params => {
        if (params.types === 'private_channel') throw new Error('The Slack app is missing the groups:read scope.')
        return { channels: [publicChannel('C0000000001', 'support')] }
      },
    })

    const result = await listChannels({ viewer: MEMBER })

    expect(result.channels.map(channel => channel.name)).toEqual(['support'])
    expect(result.notice).toBe('Private channels could not be listed: The Slack app is missing the groups:read scope.')
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
      channel: { id: 'C0000000001', name: 'support', private: false },
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

    expect(byId.channel).toEqual({ id: 'C0000000001', name: 'support', private: false })
    expect(byMention.channel).toEqual({ id: 'C0000000002', name: 'support', private: false })
    expect(callsTo('conversations.list')).toHaveLength(0)
    expect(callsTo('conversations.history').map(params => params.channel)).toEqual(['C0000000001', 'C0000000002'])
  })

  it('reads a private channel for a member of it, by name or by id', async () => {
    routeSlack({
      'conversations.list': listByType({ privateChannels: [privateChannel('C0000000002', 'squad-returns')] }),
      'conversations.info': { channel: privateChannel('C0000000002', 'squad-returns') },
      'conversations.members': { members: ['U0000000009', 'U0000000001'] },
      'conversations.history': { messages: [] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const byName = await readChannelHistory('#squad-returns', { viewer: MEMBER })
    const byId = await readChannelHistory('C0000000002', { viewer: { userId: 7, slackChannelId: 'D0000000009' } })

    expect(byName.channel).toEqual({ id: 'C0000000002', name: 'squad-returns', private: true })
    expect(byId.channel).toEqual({ id: 'C0000000002', name: 'squad-returns', private: true })
    expect(callsTo('conversations.history').map(params => params.channel)).toEqual(['C0000000002', 'C0000000002'])
  })

  it('reads a legacy private channel, whose id starts with G, for a member of it', async () => {
    routeSlack({
      'conversations.info': {
        channel: { id: 'G0000000002', name: 'old-team', is_channel: false, is_group: true, is_private: true },
      },
      'conversations.members': { members: ['U0000000001'] },
      'conversations.history': { messages: [] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const result = await readChannelHistory('G0000000002', { viewer: MEMBER })

    expect(result.channel).toEqual({ id: 'G0000000002', name: 'old-team', private: true })
  })

  it('refuses a private channel the person asking is not a member of', async () => {
    routeSlack({
      'conversations.info': { channel: privateChannel('C0000000003', 'leadership') },
      'conversations.members': { members: ['U0000000009'] },
    })

    await expect(readChannelHistory('C0000000003', { viewer: MEMBER })).rejects.toThrow(NOT_A_MEMBER)
    expect(callsTo('conversations.history')).toHaveLength(0)
  })

  it('refuses a private channel when nobody, or nobody Slack knows, is asking', async () => {
    findUserById.mockResolvedValue({ id: 7, email: null, slackId: null })
    routeSlack({ 'conversations.info': { channel: privateChannel('C0000000002', 'squad-returns') } })

    await expect(readChannelHistory('C0000000002')).rejects.toThrow(NO_IDENTITY)
    await expect(readChannelHistory('C0000000002', { viewer: MEMBER })).rejects.toThrow(NO_IDENTITY)
    expect(callsTo('conversations.members')).toHaveLength(0)
    expect(callsTo('conversations.history')).toHaveLength(0)
  })

  it('refuses a private channel asked about from another Slack conversation, even for a member', async () => {
    routeSlack({
      'conversations.info': { channel: privateChannel('C0000000002', 'squad-returns') },
      'conversations.members': { members: ['U0000000001'] },
      'conversations.history': { messages: [] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    await expect(
      readChannelHistory('C0000000002', { viewer: { userId: 7, slackChannelId: 'C0000000009' } })
    ).rejects.toThrow(SHARED_THREAD)
    const fromSameChannel = await readChannelHistory('C0000000002', {
      viewer: { userId: 7, slackChannelId: 'C0000000002' },
    })

    expect(fromSameChannel.channel.name).toBe('squad-returns')
    expect(callsTo('conversations.history')).toHaveLength(1)
  })

  it('never reads a direct message or a group message, even for someone in it', async () => {
    routeSlack({
      'conversations.info': params =>
        params.channel === 'C0000000005'
          ? { channel: { id: 'C0000000005', is_im: true, is_private: true, user: 'U0000000001' } }
          : { channel: privateChannel('G0000000006', 'mpdm-ana--luis-1', { is_mpim: true, is_group: true }) },
      'conversations.members': { members: ['U0000000001'] },
      'conversations.history': { messages: [] },
    })

    await expect(readChannelHistory('C0000000005', { viewer: MEMBER })).rejects.toThrow(DIRECT_OR_GROUP)
    await expect(readChannelHistory('G0000000006', { viewer: MEMBER })).rejects.toThrow(DIRECT_OR_GROUP)
    expect(callsTo('conversations.members')).toHaveLength(0)
    expect(callsTo('conversations.history')).toHaveLength(0)
  })

  it('refuses direct message ids without calling Slack', async () => {
    await expect(readChannelHistory('D0123ABCDE', { viewer: MEMBER })).rejects.toThrow(DIRECT_OR_GROUP)
    await expect(readChannelHistory('<#D0123ABCDE|ana>', { viewer: MEMBER })).rejects.toThrow(DIRECT_OR_GROUP)
    expect(callSlack).not.toHaveBeenCalled()
  })

  it('does not reveal a private channel name to someone who is not in it', async () => {
    routeSlack({
      'conversations.list': listByType({ privateChannels: [privateChannel('C0000000003', 'leadership')] }),
      'conversations.members': { members: ['U0000000009'] },
    })

    await expect(readChannelHistory('#leadership', { viewer: MEMBER })).rejects.toThrow(
      'There is no public Slack channel named #leadership, nor a private one that both the bot and the person asking are in.'
    )
    await expect(readChannelHistory('  ')).rejects.toThrow('A Slack channel name or id is required.')
    expect(callsTo('conversations.info')).toHaveLength(0)
  })

  it('looks a name up among the private channels only when it knows who is asking', async () => {
    routeSlack({ 'conversations.list': listByType({ privateChannels: [privateChannel('C0000000002', 'squad')] }) })

    await expect(readChannelHistory('#squad')).rejects.toThrow(/There is no public Slack channel named #squad/)
    expect(callsTo('conversations.list').map(params => params.types)).toEqual(['public_channel'])
  })

  it('explains a conversation the bot cannot see instead of asking for more scopes', async () => {
    routeSlack({
      'conversations.info': { channel: publicChannel('C0000000001', 'support') },
      'conversations.history': { messages: [] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    await readChannelHistory('C0000000001')

    const [, , infoMessages] = callSlack.mock.calls.find(([method]) => method === 'conversations.info')
    const [, , historyMessages] = callSlack.mock.calls.find(([method]) => method === 'conversations.history')
    expect(infoMessages.missing_scope).toMatch(/a direct or group message, which Soporti never reads/)
    expect(historyMessages.not_in_channel).toMatch(/add it first with \/invite/)
    expect(historyMessages.missing_scope).toBeUndefined()
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

  it('reads a thread in a private channel only for a member of it', async () => {
    routeSlack({
      'conversations.info': { channel: privateChannel('C0000000002', 'squad-returns') },
      'conversations.members': { members: ['U0000000001'] },
      'conversations.replies': { messages: [] },
      'auth.test': { url: 'https://acme.slack.com/' },
    })

    const forMember = await readThread('C0000000002', '1700000000.123456', { viewer: MEMBER })
    findUserById.mockResolvedValue({ id: 8, email: null, slackId: 'U0000000008' })

    expect(forMember.channel.private).toBe(true)
    await expect(readThread('C0000000002', '1700000000.123456', { viewer: { userId: 8 } })).rejects.toThrow(
      NOT_A_MEMBER
    )
    expect(callsTo('conversations.replies')).toHaveLength(1)
  })
})
