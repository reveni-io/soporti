import { getJevApiKey } from './settings.js'

const BASE_URL = 'https://api.typesafe.ai/v1'
const REQUEST_TIMEOUT_MS = 15_000
const MS_PER_SECOND = 1000
const UNAUTHORIZED = 401
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

async function send(path, { apiKey, timeoutMs }) {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err.name === TIMEOUT_ERROR) throw new JevApiError(`Jev error (timeout after ${timeoutMs / MS_PER_SECOND} s)`)
    throw new JevApiError('Jev error (could not reach the API)')
  }
}

async function request(path) {
  const apiKey = await getJevApiKey()
  if (!apiKey) throw new JevApiError(NOT_CONFIGURED_MESSAGE)

  const response = await send(path, { apiKey, timeoutMs: REQUEST_TIMEOUT_MS })
  if (!response.ok) throw new JevApiError(describeStatus(response.status), response.status)

  return response.json()
}

function toModel({ name, description, release_date: releaseDate }) {
  return { name, description: typeof description === 'string' ? description : '', releaseDate: releaseDate ?? null }
}

export async function listModels() {
  const data = await request('/models')
  const models = Array.isArray(data?.models) ? data.models : []

  return models.filter(model => typeof model?.name === 'string' && model.name.length > 0).map(toModel)
}
