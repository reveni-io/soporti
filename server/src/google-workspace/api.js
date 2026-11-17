import { describeInstant } from '../agent/clock.js'
import { getGoogleAccessToken, invalidateGoogleAccessToken } from './settings.js'

const REQUEST_TIMEOUT_MS = 15_000
const MAX_DETAIL_CHARS = 300
const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'])
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'RESOURCE_EXHAUSTED'])

async function readFailure(res) {
  try {
    const { error } = JSON.parse(await res.text())

    return {
      reason: error?.errors?.[0]?.reason || error?.status || '',
      detail: String(error?.message || '').slice(0, MAX_DETAIL_CHARS),
    }
  } catch {
    return { reason: '', detail: '' }
  }
}

function describeFailure(service, { status, reason, detail }) {
  if (status === 401) return `${service} rejected the Google access. Reconnect Google from Settings → Connections.`
  if (SCOPE_REASONS.has(reason)) {
    return `${service} access was not granted. Reconnect Google from Settings → Connections and allow ${service}.`
  }
  if (status === 429 || RATE_LIMIT_REASONS.has(reason)) {
    return `${service} is rate-limiting requests. Try again shortly.`
  }
  if (status === 404) return `${service} found nothing with that id. It may have been deleted, or the id is wrong.`
  if (status === 400 || status === 403) return `${service} refused the request (${status}): ${detail || reason}`

  return `${service} request failed (${status}).`
}

async function send(url, token, { method, body, service }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return { ok: true, status: res.status, data: await res.json() }

    return { ok: false, status: res.status, ...(await readFailure(res)) }
  } catch (err) {
    if (err?.name !== 'AbortError') throw err

    throw new Error(`${service} did not answer in time. Try again with a narrower request.`, { cause: err })
  } finally {
    clearTimeout(timer)
  }
}

export async function googleRequest(userId, url, { method = 'GET', body = null, service }) {
  const options = { method, body, service }
  let result = await send(url, await getGoogleAccessToken(userId), options)

  if (result.status === 401) {
    invalidateGoogleAccessToken(userId)
    result = await send(url, await getGoogleAccessToken(userId), options)
  }

  if (!result.ok) throw new Error(describeFailure(service, result))

  return result.data
}

export function toZonedTime(value, timeZone) {
  const instant = new Date(value)
  if (value === null || value === undefined || Number.isNaN(instant.getTime())) return value

  return describeInstant(instant, timeZone).local
}
