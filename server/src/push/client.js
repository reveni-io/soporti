import { encryptPushPayload } from './encrypt.js'
import { parsePushSubscription } from './subscription.js'
import { buildVapidAuthorization } from './vapid.js'
import { PUSH_OUTCOME_DELIVERED, PUSH_OUTCOME_FAILED, PUSH_OUTCOME_GONE } from '../constants.js'

const TTL_SECONDS = 86_400
const TIMEOUT_MS = 10_000
const GONE_STATUSES = new Set([404, 410])
const PUSH_HEADERS = {
  TTL: String(TTL_SECONDS),
  'Content-Encoding': 'aes128gcm',
  'Content-Type': 'application/octet-stream',
  Urgency: 'normal',
}

function toOutcome(response) {
  if (response.ok) return { outcome: PUSH_OUTCOME_DELIVERED, status: response.status }
  if (GONE_STATUSES.has(response.status)) return { outcome: PUSH_OUTCOME_GONE, status: response.status }

  return { outcome: PUSH_OUTCOME_FAILED, status: response.status }
}

export async function sendPushMessage(subscription, payload) {
  const { error, value } = parsePushSubscription(subscription)
  if (error) return { outcome: PUSH_OUTCOME_GONE, status: null }

  const response = await fetch(value.endpoint, {
    method: 'POST',
    headers: { ...PUSH_HEADERS, Authorization: await buildVapidAuthorization(value.endpoint) },
    body: encryptPushPayload(Buffer.from(JSON.stringify(payload)), value),
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  await response.body?.cancel()

  return toOutcome(response)
}
