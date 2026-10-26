import { redactSecrets } from '../review/output-guard.js'
import { getSlackBotToken } from './settings.js'

const API_URL = 'https://slack.com/api'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_MESSAGE_CHARS = 12_000
const CHANNEL_ID_RE = /^[CG][A-Z0-9]{8,}$/
const LEADING_HASH_RE = /^#/
const NOT_CONFIGURED_MESSAGE = 'Slack is not configured. Set the bot token in the admin panel (Slack section).'
const SLACK_ERROR_MESSAGES = {
  not_in_channel:
    'The bot is not a member of this channel, so it cannot post there. Someone in the channel has to invite it first.',
  channel_not_found:
    'Slack cannot find this channel. Check the name — a private channel is only visible to the bot once it has been invited.',
  is_archived: 'This channel is archived, so nobody can post in it.',
  restricted_action: 'A workspace setting prevents the bot from posting in this channel.',
}

function describeSlackError(method, code) {
  return SLACK_ERROR_MESSAGES[code] ?? `Slack API ${method} failed: ${code}.`
}

async function callSlack(method, params) {
  const token = await getSlackBotToken()
  if (!token) throw new Error(NOT_CONFIGURED_MESSAGE)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${API_URL}/${method}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
      body: new URLSearchParams(params),
    })
    if (!res.ok) throw new Error(`Slack API ${method} failed (${res.status}).`)

    const data = await res.json()
    if (!data.ok) throw new Error(describeSlackError(method, data.error))

    return data
  } finally {
    clearTimeout(timer)
  }
}

function toChannelArgument(channel) {
  const raw = String(channel ?? '').trim()
  if (CHANNEL_ID_RE.test(raw)) return raw

  const name = raw.replace(LEADING_HASH_RE, '').toLowerCase()
  if (!name) throw new Error('A Slack channel name or id is required.')

  return `#${name}`
}

async function findPermalink(channel, ts) {
  try {
    const data = await callSlack('chat.getPermalink', { channel, message_ts: ts })
    return data.permalink
  } catch (err) {
    console.error('[slack] Failed to get the permalink of a posted message:', err.message)
    return null
  }
}

export async function postMessage(channel, text) {
  const target = toChannelArgument(channel)
  const body = redactSecrets(String(text ?? '').trim())

  if (!body) throw new Error('A Slack message needs some text.')
  if (body.length > MAX_MESSAGE_CHARS) {
    throw new Error(
      `The message is ${body.length} characters long and Slack takes at most ${MAX_MESSAGE_CHARS}: shorten it and post it again.`
    )
  }

  const posted = await callSlack('chat.postMessage', { channel: target, markdown_text: body })

  return { channel: posted.channel, ts: posted.ts, permalink: await findPermalink(posted.channel, posted.ts) }
}
