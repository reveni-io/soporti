import { describeInstant } from '../agent/clock.js'
import { DEFAULT_TIMEZONE } from '../constants.js'
import { findUserById } from '../db/users.js'
import { mapWithConcurrency } from '../review/concurrency.js'
import { redactSecrets } from '../review/output-guard.js'
import { callSlack } from './client.js'

export const DEFAULT_CHANNEL_RESULTS = 100
export const MAX_CHANNEL_RESULTS = 500
export const DEFAULT_HISTORY_MESSAGES = 50
export const DEFAULT_THREAD_MESSAGES = 100
export const MAX_READ_MESSAGES = 200
export const MAX_MESSAGE_CHARS = 4_000

const CHANNEL_ID_RE = /^[CG][A-Z0-9]{8,}$/
const DIRECT_MESSAGE_ID_RE = /^D[A-Z0-9]{8,}$/
const CHANNEL_REFERENCE_RE = /^<#([A-Z0-9]+)(?:\|[^>]*)?>$/
const LEADING_HASH_RE = /^#/
const MESSAGE_TS_RE = /^\d{9,10}\.\d{6}$/
const LINK_TS_RE = /^p(\d{9,10})(\d{6})$/
const USER_MENTION_RE = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g
const CHANNEL_MENTION_RE = /<#[A-Z0-9]+\|([^>]*)>/g
const BROADCAST_MENTION_RE = /<!(here|channel|everyone)(?:\|[^>]*)?>/g
const GROUP_MENTION_RE = /<!subteam\^[A-Z0-9]+\|([^>]*)>/g
const PAGE_SIZE = 1000
const MAX_PAGES = 10
const CHANNEL_CACHE_TTL_MS = 60_000
const USER_CACHE_TTL_MS = 3_600_000
const WORKSPACE_CACHE_TTL_MS = 3_600_000
const LOOKUP_CONCURRENCY = 5
const SKIPPED_SUBTYPES = new Set(['channel_join', 'channel_leave'])
const PUBLIC_CHANNELS_CACHE_KEY = 'public-channels'
const PRIVATE_CHANNELS_CACHE_KEY = 'private-channels'
const WORKSPACE_CACHE_KEY = 'workspace'
const DIRECT_MESSAGE_ERROR = 'This conversation is a direct message or a group message. Soporti never reads them.'
const PRIVATE_WITHOUT_IDENTITY_ERROR =
  'This is a private channel. Soporti reads one only for its members, and it cannot match the person asking to a Slack user (by their Slack account or their email), so here it reads only public channels.'
const PRIVATE_NOT_MEMBER_ERROR =
  'This is a private channel and the person asking is not a member of it. Soporti reads a private channel only for its members.'
const PRIVATE_IN_SHARED_THREAD_ERROR =
  'This is a private channel, and everyone in this Slack conversation would read the answer. Ask from a direct message with the bot, or from that same channel.'
const READ_ERROR_MESSAGES = {
  not_in_channel:
    'The Soporti bot is not a member of this channel, so it cannot read it. Someone in the channel has to add it first with /invite.',
  channel_not_found:
    'Slack cannot find this channel. A private channel is only visible once the bot has been added to it.',
  thread_not_found: 'There is no message with that ts in this channel.',
}
const INFO_ERROR_MESSAGES = {
  ...READ_ERROR_MESSAGES,
  missing_scope:
    'Slack does not let the bot see this conversation: it is a direct or group message, which Soporti never reads, or a private channel while the Slack app lacks the groups:read scope.',
}

const cache = new Map()

async function remember(key, ttlMs, load) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const value = await load()
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })

  return value
}

function readSlack(method, params) {
  return callSlack(method, params, READ_ERROR_MESSAGES)
}

function isPublicChannel(channel) {
  return channel?.is_channel === true && channel.is_private === false && !channel.is_im && !channel.is_mpim
}

function isPrivateChannel(channel) {
  const isChannelLike = channel?.is_channel === true || channel?.is_group === true

  return isChannelLike && channel.is_private === true && !channel.is_im && !channel.is_mpim
}

function toChannelSummary(channel) {
  return {
    id: channel.id,
    name: channel.name,
    private: channel.is_private === true,
    topic: channel.topic?.value || null,
    purpose: channel.purpose?.value || null,
    members: channel.num_members ?? null,
    botIsMember: Boolean(channel.is_member),
  }
}

function byName(a, b) {
  return a.name.localeCompare(b.name)
}

async function collectPages(method, params, pickItems) {
  const items = []
  let cursor = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await readSlack(method, { ...params, limit: String(PAGE_SIZE), cursor })
    items.push(...pickItems(data))

    cursor = data.response_metadata?.next_cursor || null
    if (!cursor) break
  }

  return items
}

async function fetchChannels(types, isWanted) {
  const channels = await collectPages('conversations.list', { types, exclude_archived: 'true' }, data => {
    return data.channels ?? []
  })

  return channels.filter(isWanted).map(toChannelSummary).sort(byName)
}

function loadPublicChannels() {
  return remember(PUBLIC_CHANNELS_CACHE_KEY, CHANNEL_CACHE_TTL_MS, () =>
    fetchChannels('public_channel', isPublicChannel)
  )
}

function loadBotPrivateChannels() {
  return remember(PRIVATE_CHANNELS_CACHE_KEY, CHANNEL_CACHE_TTL_MS, () => {
    return fetchChannels('private_channel', isPrivateChannel)
  })
}

async function fetchMembers(channelId) {
  const members = await collectPages('conversations.members', { channel: channelId }, data => data.members ?? [])

  return new Set(members)
}

async function isChannelMember(channelId, slackUserId) {
  const members = await remember(`members:${channelId}`, CHANNEL_CACHE_TTL_MS, () => fetchMembers(channelId))

  return members.has(slackUserId)
}

async function fetchSlackIdByEmail(email) {
  const data = await readSlack('users.lookupByEmail', { email })

  return data.user?.id ?? null
}

async function lookUpSlackIdByEmail(email) {
  try {
    return await remember(`email:${email}`, USER_CACHE_TTL_MS, () => fetchSlackIdByEmail(email))
  } catch (err) {
    console.error('[slack] Failed to find the Slack user of the person asking:', err.message)
    return null
  }
}

async function findViewerSlackId(userId) {
  if (!userId) return null

  const user = await findUserById(userId)
  if (user?.slackId) return user.slackId
  if (!user?.email) return null

  return lookUpSlackIdByEmail(user.email)
}

function answersInSharedSlackThread(viewer, channelId) {
  const origin = viewer.slackChannelId
  if (!origin || DIRECT_MESSAGE_ID_RE.test(origin)) return false

  return origin !== channelId
}

async function listViewerPrivateChannels(viewer) {
  const slackUserId = await findViewerSlackId(viewer.userId)
  if (!slackUserId) return []

  const candidates = (await loadBotPrivateChannels()).filter(channel => {
    return !answersInSharedSlackThread(viewer, channel.id)
  })
  const isMember = await mapWithConcurrency(candidates, LOOKUP_CONCURRENCY, channel => {
    return isChannelMember(channel.id, slackUserId)
  })

  return candidates.filter((_, index) => isMember[index])
}

async function loadReadablePrivateChannels(viewer) {
  try {
    return { channels: await listViewerPrivateChannels(viewer) }
  } catch (err) {
    console.error('[slack] Failed to list the private channels:', err.message)
    return { channels: [], notice: `Private channels could not be listed: ${err.message}` }
  }
}

function matchesQuery(channel, needle) {
  return [channel.name, channel.topic, channel.purpose].some(field => field?.toLowerCase().includes(needle))
}

export async function listChannels({ query = '', limit = DEFAULT_CHANNEL_RESULTS, viewer = {} } = {}) {
  const [publicChannels, privates] = await Promise.all([loadPublicChannels(), loadReadablePrivateChannels(viewer)])
  const channels = [...publicChannels, ...privates.channels].sort(byName)
  const needle = query.trim().replace(LEADING_HASH_RE, '').toLowerCase()
  const matches = needle ? channels.filter(channel => matchesQuery(channel, needle)) : channels

  const result = { channels: matches.slice(0, limit), total: matches.length, hasMore: matches.length > limit }
  if (privates.notice) result.notice = privates.notice

  return result
}

function parseChannelReference(channel) {
  const raw = String(channel ?? '').trim()
  const id = CHANNEL_REFERENCE_RE.exec(raw)?.[1] ?? raw

  if (DIRECT_MESSAGE_ID_RE.test(id)) throw new Error(DIRECT_MESSAGE_ERROR)
  if (CHANNEL_ID_RE.test(id)) return { id }

  const name = raw.replace(LEADING_HASH_RE, '').toLowerCase()
  if (!name) throw new Error('A Slack channel name or id is required.')

  return { name }
}

async function findChannelIdByName(name, viewer) {
  const publicMatch = (await loadPublicChannels()).find(channel => channel.name === name)
  if (publicMatch) return publicMatch.id

  const slackUserId = await findViewerSlackId(viewer.userId)
  const privateMatch = slackUserId && (await loadBotPrivateChannels()).find(channel => channel.name === name)
  if (privateMatch && (await isChannelMember(privateMatch.id, slackUserId))) return privateMatch.id

  throw new Error(
    `There is no public Slack channel named #${name}, nor a private one that both the bot and the person asking are in.`
  )
}

async function assertCanRead(channel, viewer) {
  if (isPublicChannel(channel)) return
  if (!isPrivateChannel(channel)) throw new Error(DIRECT_MESSAGE_ERROR)

  const slackUserId = await findViewerSlackId(viewer.userId)
  if (!slackUserId) throw new Error(PRIVATE_WITHOUT_IDENTITY_ERROR)
  if (!(await isChannelMember(channel.id, slackUserId))) throw new Error(PRIVATE_NOT_MEMBER_ERROR)
  if (answersInSharedSlackThread(viewer, channel.id)) throw new Error(PRIVATE_IN_SHARED_THREAD_ERROR)
}

async function resolveReadableChannel(channel, viewer) {
  const reference = parseChannelReference(channel)
  const id = reference.id ?? (await findChannelIdByName(reference.name, viewer))

  const data = await callSlack('conversations.info', { channel: id }, INFO_ERROR_MESSAGES)
  await assertCanRead(data.channel, viewer)

  return { id: data.channel.id, name: data.channel.name, private: data.channel.is_private === true }
}

function displayName(user) {
  const profile = user?.profile ?? {}

  return profile.display_name || profile.real_name || user?.real_name || user?.name || null
}

async function fetchUserName(id) {
  const data = await readSlack('users.info', { user: id })

  return displayName(data.user) ?? id
}

async function lookUpUserName(id) {
  try {
    return await remember(`user:${id}`, USER_CACHE_TTL_MS, () => fetchUserName(id))
  } catch (err) {
    console.error('[slack] Failed to look up a user name:', err.message)
    return id
  }
}

function collectUserIds(messages) {
  const ids = new Set()

  for (const message of messages) {
    if (message.user) ids.add(message.user)
    for (const mention of String(message.text ?? '').matchAll(USER_MENTION_RE)) ids.add(mention[1])
  }

  return [...ids]
}

async function resolveUserNames(messages) {
  const ids = collectUserIds(messages)
  const names = await mapWithConcurrency(ids, LOOKUP_CONCURRENCY, lookUpUserName)

  return new Map(ids.map((id, index) => [id, names[index]]))
}

async function fetchWorkspaceUrl() {
  const data = await readSlack('auth.test', {})

  return data.url ?? null
}

async function loadWorkspaceUrl() {
  try {
    return await remember(WORKSPACE_CACHE_KEY, WORKSPACE_CACHE_TTL_MS, fetchWorkspaceUrl)
  } catch (err) {
    console.error('[slack] Failed to look up the workspace url:', err.message)
    return null
  }
}

function attachmentText(attachment) {
  return [attachment.title, attachment.text].filter(Boolean).join('\n') || attachment.fallback || ''
}

function renderText(message, names) {
  const parts = [message.text, ...(message.attachments ?? []).map(attachmentText)].filter(Boolean)

  const text = parts
    .join('\n')
    .replace(USER_MENTION_RE, (_, id) => `@${names.get(id) ?? id}`)
    .replace(CHANNEL_MENTION_RE, (_, name) => `#${name}`)
    .replace(BROADCAST_MENTION_RE, (_, target) => `@${target}`)
    .replace(GROUP_MENTION_RE, (_, handle) => handle)

  return redactSecrets(text)
}

function describeAuthor(message, names) {
  if (message.user) return names.get(message.user) ?? message.user

  return message.bot_profile?.name || message.username || 'unknown'
}

function messageUrl(workspaceUrl, channelId, message) {
  if (!workspaceUrl) return null

  const url = `${workspaceUrl}archives/${channelId}/p${message.ts.replace('.', '')}`
  if (!message.thread_ts || message.thread_ts === message.ts) return url

  return `${url}?thread_ts=${message.thread_ts}&cid=${channelId}`
}

function toMessage(message, { channelId, names, workspaceUrl, timeZone }) {
  const text = renderText(message, names)
  const entry = {
    ts: message.ts,
    time: describeInstant(new Date(Number(message.ts) * 1000), timeZone).local,
    author: describeAuthor(message, names),
    text: text.slice(0, MAX_MESSAGE_CHARS),
    url: messageUrl(workspaceUrl, channelId, message),
  }

  if (text.length > MAX_MESSAGE_CHARS) entry.truncated = true
  if (message.reply_count) entry.replies = message.reply_count
  if (message.files?.length) entry.files = message.files.map(file => file.name || file.title || 'file')

  return entry
}

async function renderMessages(rawMessages, { channelId, timeZone }) {
  const messages = (rawMessages ?? []).filter(message => !SKIPPED_SUBTYPES.has(message.subtype))
  const [names, workspaceUrl] = await Promise.all([resolveUserNames(messages), loadWorkspaceUrl()])

  return messages.map(message => toMessage(message, { channelId, names, workspaceUrl, timeZone }))
}

function toSlackTs(isoTime) {
  if (!isoTime) return null

  return (Date.parse(isoTime) / 1000).toFixed(6)
}

function toPage(channel, data, messages) {
  return {
    channel,
    messages,
    hasMore: Boolean(data.has_more),
    nextCursor: data.response_metadata?.next_cursor || null,
  }
}

export async function readChannelHistory(
  channel,
  {
    timeMin = null,
    timeMax = null,
    limit = DEFAULT_HISTORY_MESSAGES,
    cursor = null,
    timeZone = DEFAULT_TIMEZONE,
    viewer = {},
  } = {}
) {
  const target = await resolveReadableChannel(channel, viewer)
  const data = await readSlack('conversations.history', {
    channel: target.id,
    oldest: toSlackTs(timeMin),
    latest: toSlackTs(timeMax),
    limit: String(limit),
    cursor,
  })
  const messages = await renderMessages(data.messages, { channelId: target.id, timeZone })

  return toPage(target, data, messages)
}

function parseMessageTs(ts) {
  const raw = String(ts ?? '').trim()
  if (MESSAGE_TS_RE.test(raw)) return raw

  const link = LINK_TS_RE.exec(raw)
  if (link) return `${link[1]}.${link[2]}`

  throw new Error(
    `"${raw}" is not a Slack message ts. Pass it like "1700000000.123456", or the "p1700000000123456" part of a message link.`
  )
}

export async function readThread(
  channel,
  ts,
  { limit = DEFAULT_THREAD_MESSAGES, cursor = null, timeZone = DEFAULT_TIMEZONE, viewer = {} } = {}
) {
  const threadTs = parseMessageTs(ts)
  const target = await resolveReadableChannel(channel, viewer)
  const data = await readSlack('conversations.replies', {
    channel: target.id,
    ts: threadTs,
    limit: String(limit),
    cursor,
  })
  const messages = await renderMessages(data.messages, { channelId: target.id, timeZone })

  return toPage(target, data, messages)
}

export function _resetSlackChannelCacheForTests() {
  cache.clear()
}
