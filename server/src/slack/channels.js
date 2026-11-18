import { describeInstant } from '../agent/clock.js'
import { DEFAULT_TIMEZONE } from '../constants.js'
import { mapWithConcurrency } from '../review/concurrency.js'
import { redactSecrets } from '../review/output-guard.js'
import { callSlack } from './client.js'

export const DEFAULT_CHANNEL_RESULTS = 100
export const MAX_CHANNEL_RESULTS = 500
export const DEFAULT_HISTORY_MESSAGES = 50
export const DEFAULT_THREAD_MESSAGES = 100
export const MAX_READ_MESSAGES = 200
export const MAX_MESSAGE_CHARS = 4_000

const PUBLIC_CHANNEL_ID_RE = /^C[A-Z0-9]{8,}$/
const NON_PUBLIC_ID_RE = /^[DG][A-Z0-9]{8,}$/
const CHANNEL_REFERENCE_RE = /^<#([A-Z0-9]+)(?:\|[^>]*)?>$/
const LEADING_HASH_RE = /^#/
const MESSAGE_TS_RE = /^\d{9,10}\.\d{6}$/
const LINK_TS_RE = /^p(\d{9,10})(\d{6})$/
const USER_MENTION_RE = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g
const CHANNEL_MENTION_RE = /<#[A-Z0-9]+\|([^>]*)>/g
const BROADCAST_MENTION_RE = /<!(here|channel|everyone)(?:\|[^>]*)?>/g
const GROUP_MENTION_RE = /<!subteam\^[A-Z0-9]+\|([^>]*)>/g
const CHANNEL_PAGE_SIZE = 1000
const MAX_CHANNEL_PAGES = 10
const CHANNEL_CACHE_TTL_MS = 60_000
const USER_CACHE_TTL_MS = 3_600_000
const WORKSPACE_CACHE_TTL_MS = 3_600_000
const USER_LOOKUP_CONCURRENCY = 5
const SKIPPED_SUBTYPES = new Set(['channel_join', 'channel_leave'])
const CHANNELS_CACHE_KEY = 'channels'
const WORKSPACE_CACHE_KEY = 'workspace'
const NOT_PUBLIC_MESSAGE =
  'This conversation is not a public channel. Soporti only reads public Slack channels, never private channels, group messages or direct messages.'
const READ_ERROR_MESSAGES = {
  not_in_channel:
    'The Soporti bot is not a member of this channel, so it cannot read it. Someone in the channel has to add it first with /invite.',
  channel_not_found: 'Slack cannot find this channel. Soporti only reads public channels.',
  thread_not_found: 'There is no message with that ts in this channel.',
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

function toChannelSummary(channel) {
  return {
    id: channel.id,
    name: channel.name,
    topic: channel.topic?.value || null,
    purpose: channel.purpose?.value || null,
    members: channel.num_members ?? null,
    botIsMember: Boolean(channel.is_member),
  }
}

async function fetchPublicChannels() {
  const channels = []
  let cursor = null

  for (let page = 0; page < MAX_CHANNEL_PAGES; page++) {
    const data = await readSlack('conversations.list', {
      types: 'public_channel',
      exclude_archived: 'true',
      limit: String(CHANNEL_PAGE_SIZE),
      cursor,
    })
    channels.push(...data.channels.filter(isPublicChannel).map(toChannelSummary))

    cursor = data.response_metadata?.next_cursor || null
    if (!cursor) break
  }

  return channels.sort((a, b) => a.name.localeCompare(b.name))
}

function loadPublicChannels() {
  return remember(CHANNELS_CACHE_KEY, CHANNEL_CACHE_TTL_MS, fetchPublicChannels)
}

function matchesQuery(channel, needle) {
  return [channel.name, channel.topic, channel.purpose].some(field => field?.toLowerCase().includes(needle))
}

export async function listPublicChannels({ query = '', limit = DEFAULT_CHANNEL_RESULTS } = {}) {
  const channels = await loadPublicChannels()
  const needle = query.trim().replace(LEADING_HASH_RE, '').toLowerCase()
  const matches = needle ? channels.filter(channel => matchesQuery(channel, needle)) : channels

  return { channels: matches.slice(0, limit), total: matches.length, hasMore: matches.length > limit }
}

function parseChannelReference(channel) {
  const raw = String(channel ?? '').trim()
  const id = CHANNEL_REFERENCE_RE.exec(raw)?.[1] ?? raw

  if (NON_PUBLIC_ID_RE.test(id)) throw new Error(NOT_PUBLIC_MESSAGE)
  if (PUBLIC_CHANNEL_ID_RE.test(id)) return { id }

  const name = raw.replace(LEADING_HASH_RE, '').toLowerCase()
  if (!name) throw new Error('A Slack channel name or id is required.')

  return { name }
}

async function findChannelIdByName(name) {
  const channels = await loadPublicChannels()
  const match = channels.find(channel => channel.name === name)
  if (!match) throw new Error(`There is no public Slack channel named #${name}.`)

  return match.id
}

async function resolvePublicChannel(channel) {
  const reference = parseChannelReference(channel)
  const id = reference.id ?? (await findChannelIdByName(reference.name))

  const data = await readSlack('conversations.info', { channel: id })
  if (!isPublicChannel(data.channel)) throw new Error(NOT_PUBLIC_MESSAGE)

  return { id: data.channel.id, name: data.channel.name }
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
  const names = await mapWithConcurrency(ids, USER_LOOKUP_CONCURRENCY, lookUpUserName)

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
  { timeMin = null, timeMax = null, limit = DEFAULT_HISTORY_MESSAGES, cursor = null, timeZone = DEFAULT_TIMEZONE } = {}
) {
  const target = await resolvePublicChannel(channel)
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
  { limit = DEFAULT_THREAD_MESSAGES, cursor = null, timeZone = DEFAULT_TIMEZONE } = {}
) {
  const threadTs = parseMessageTs(ts)
  const target = await resolvePublicChannel(channel)
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
