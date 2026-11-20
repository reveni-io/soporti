import { shortenText } from '../analytics/text.js'
import { deletePushSubscription, listPushSubscriptions } from '../db/push-subscriptions.js'
import { redactSecrets } from '../review/output-guard.js'
import { sendPushMessage } from './client.js'
import { toPlainText } from './plain-text.js'
import { CHAT_PATH, PUSH_OUTCOME_DELIVERED, PUSH_OUTCOME_GONE } from '../constants.js'

const BOTS_PATH = '/bots'
const VIDEOS_PATH = '/videos'
const CONVERSATION_PARAM = 'conversation'
const MAX_TITLE_LENGTH = 80
const MAX_BODY_LENGTH = 180
const MAX_MARKDOWN_CHARS = 4000
const REJECTED = 'rejected'

export function botTarget(botId) {
  return { url: `${BOTS_PATH}/${botId}`, tag: `bot-${botId}` }
}

export function conversationTarget(conversationId) {
  return { url: `${CHAT_PATH}?${CONVERSATION_PARAM}=${conversationId}`, tag: `conversation-${conversationId}` }
}

export function videoTarget(videoId) {
  return { url: `${VIDEOS_PATH}/${videoId}`, tag: `video-${videoId}` }
}

function toNotificationBody(markdown) {
  const plainText = toPlainText(redactSecrets(markdown).slice(0, MAX_MARKDOWN_CHARS))

  return shortenText(plainText, MAX_BODY_LENGTH)
}

function buildPayload({ title, body, url, tag }) {
  return { title: shortenText(title, MAX_TITLE_LENGTH), body: toNotificationBody(body), url, tag }
}

function pushServiceHost(endpoint) {
  return new URL(endpoint).host
}

async function forgetSubscription(endpoint) {
  try {
    await deletePushSubscription(endpoint)
  } catch (err) {
    console.error('[push] Failed to delete a gone subscription:', err.message)
  }
}

async function settleDelivery(subscription, result) {
  if (result.status === REJECTED) {
    console.error(
      `[push] Failed to send a notification through ${pushServiceHost(subscription.endpoint)}:`,
      result.reason?.message
    )
    return false
  }

  const { outcome, status } = result.value
  if (outcome === PUSH_OUTCOME_DELIVERED) return true
  if (outcome === PUSH_OUTCOME_GONE) {
    await forgetSubscription(subscription.endpoint)
    return false
  }

  console.error(`[push] ${pushServiceHost(subscription.endpoint)} refused a notification with status ${status}.`)
  return false
}

export async function notifySubscriptions(subscriptions, message) {
  const payload = buildPayload(message)
  const results = await Promise.allSettled(subscriptions.map(subscription => sendPushMessage(subscription, payload)))
  const delivered = await Promise.all(results.map((result, index) => settleDelivery(subscriptions[index], result)))

  return delivered.filter(Boolean).length
}

export async function notifyUser(userId, message) {
  try {
    const subscriptions = await listPushSubscriptions(userId)
    if (subscriptions.length === 0) return 0

    return await notifySubscriptions(subscriptions, message)
  } catch (err) {
    console.error('[push] Failed to notify a user:', err)
    return 0
  }
}
