import { getJevApiKey } from './settings.js'

const BASE_URL = 'https://api.typesafe.ai/v1'
const MODELS_TIMEOUT_MS = 15_000
const MS_PER_SECOND = 1000
const UNAUTHORIZED = 401
const REQUEST_TIMEOUT = 408
const TOO_MANY_REQUESTS = 429
const FIRST_SERVER_ERROR = 500
const MAX_ASK_ATTEMPTS = 3
const FIRST_BACKOFF_MS = 500
const TIMEOUT_ERROR = 'TimeoutError'
const NOT_CONFIGURED_MESSAGE = 'Jev is not configured: save the API key in the admin panel (Jev section)'

export class JevApiError extends Error {
  constructor(message, status = null) {
    super(message)
    this.name = 'JevApiError'
    this.status = status
  }
}

function describeStatus(status) {
  if (status === UNAUTHORIZED) return 'Jev rejected the API key (HTTP 401)'

  return `Jev error (HTTP ${status})`
}

function isRetryableStatus(status) {
  return status === REQUEST_TIMEOUT || status === TOO_MANY_REQUESTS || status >= FIRST_SERVER_ERROR
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildInit(apiKey, body) {
  if (body === null) return { headers: { Authorization: `Bearer ${apiKey}` } }

  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body,
  }
}

function timeoutMessage(totalMs) {
  return `Jev error (timeout after ${totalMs / MS_PER_SECOND} s)`
}

async function attempt(path, { apiKey, body, remainingMs, totalMs }) {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...buildInit(apiKey, body),
      signal: AbortSignal.timeout(Math.max(1, remainingMs)),
    })
    if (response.ok) return { response }

    const error = new JevApiError(describeStatus(response.status), response.status)
    return { error, retryable: isRetryableStatus(response.status) }
  } catch (err) {
    if (err.name === TIMEOUT_ERROR) return { error: new JevApiError(timeoutMessage(totalMs)), retryable: false }
    return { error: new JevApiError('Jev error (could not reach the API)'), retryable: true }
  }
}

async function readJson(response, totalMs) {
  try {
    return await response.json()
  } catch (err) {
    throw new JevApiError(err.name === TIMEOUT_ERROR ? timeoutMessage(totalMs) : 'Jev error (invalid response)')
  }
}

async function request(path, { body = null, timeoutMs, maxAttempts = 1 }) {
  const apiKey = await getJevApiKey()
  if (!apiKey) throw new JevApiError(NOT_CONFIGURED_MESSAGE)

  const deadline = Date.now() + timeoutMs
  let backoffMs = FIRST_BACKOFF_MS

  for (let attemptNumber = 1; ; attemptNumber++) {
    const outcome = await attempt(path, { apiKey, body, remainingMs: deadline - Date.now(), totalMs: timeoutMs })
    if (outcome.response) return readJson(outcome.response, timeoutMs)

    const canRetry = outcome.retryable && attemptNumber < maxAttempts && deadline - Date.now() > backoffMs
    if (!canRetry) throw outcome.error

    await wait(backoffMs)
    backoffMs *= 2
  }
}

function toModel({ name, description, release_date: releaseDate }) {
  return { name, description: typeof description === 'string' ? description : '', releaseDate: releaseDate ?? null }
}

export async function listModels() {
  const data = await request('/models', { timeoutMs: MODELS_TIMEOUT_MS })
  const models = Array.isArray(data?.models) ? data.models : []

  return models.filter(model => typeof model?.name === 'string' && model.name.length > 0).map(toModel)
}

export async function askQuestions({ model, state, questions, timeoutMs }) {
  const body = JSON.stringify({ model, state, questions })
  const data = await request('/systemone', { body, timeoutMs, maxAttempts: MAX_ASK_ATTEMPTS })

  return { model: typeof data?.model === 'string' ? data.model : model, answers: data?.answers ?? {} }
}
