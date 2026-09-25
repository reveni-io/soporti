import {
  deleteZendeskConnection,
  getZendeskConnection as getStoredZendeskConnection,
  saveZendeskCredentials,
  updateZendeskOptions,
} from '../db/zendesk-connections.js'
import { EMAIL_RE, MAX_EMAIL_LENGTH } from '../constants.js'

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const API_TOKEN_RE = /^[A-Za-z0-9]{20,100}$/
const VIEW_ID_RE = /^\d{1,20}$/
const PROTOCOL_RE = /^https?:\/\//
const ZENDESK_HOST_SUFFIX = '.zendesk.com'
const CACHE_TTL_MS = 60_000
export const INVALID_ZENDESK_CONNECTION = 'INVALID_ZENDESK_CONNECTION'

const cache = new Map()

function invalid(message) {
  const err = new Error(message)
  err.code = INVALID_ZENDESK_CONNECTION
  return err
}

function normalizeSubdomain(input) {
  const host = input.trim().toLowerCase().replace(PROTOCOL_RE, '').split('/')[0]

  return host.endsWith(ZENDESK_HOST_SUFFIX) ? host.slice(0, -ZENDESK_HOST_SUFFIX.length) : host
}

function parseZendeskCredentials({ subdomain, email, apiToken } = {}) {
  const normalizedSubdomain = typeof subdomain === 'string' ? normalizeSubdomain(subdomain) : ''
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  const trimmedToken = typeof apiToken === 'string' ? apiToken.trim() : ''

  if (!SUBDOMAIN_RE.test(normalizedSubdomain)) {
    throw invalid('That does not look like a Zendesk subdomain. Use the "acme" part of acme.zendesk.com.')
  }
  if (trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(trimmedEmail)) {
    throw invalid('That does not look like the email of a Zendesk agent.')
  }
  if (!API_TOKEN_RE.test(trimmedToken)) {
    throw invalid('That does not look like a Zendesk API token.')
  }

  return { subdomain: normalizedSubdomain, email: trimmedEmail, apiToken: trimmedToken }
}

export function parseZendeskViewId(input) {
  const trimmed = typeof input === 'string' ? input.trim() : ''

  if (trimmed === '') return null
  if (!VIEW_ID_RE.test(trimmed)) throw invalid('A Zendesk view id is a number, like the one at the end of its url.')

  return trimmed
}

export async function getZendeskConnection(userId) {
  if (!userId) return null

  const entry = cache.get(userId)
  if (entry && entry.expiresAt > Date.now()) return entry.value
  cache.delete(userId)

  const value = await getStoredZendeskConnection(userId)
  cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export function describeZendeskConnection(connection) {
  if (!connection) return { connected: false, subdomain: null, email: null, writesEnabled: false, viewId: null }

  return {
    connected: true,
    subdomain: connection.subdomain,
    email: connection.email,
    writesEnabled: connection.writesEnabled,
    viewId: connection.viewId,
  }
}

export async function connectZendesk(userId, input) {
  const connection = await saveZendeskCredentials(userId, parseZendeskCredentials(input))
  cache.delete(userId)

  return connection
}

export async function disconnectZendesk(userId) {
  await deleteZendeskConnection(userId)
  cache.delete(userId)
}

async function updateOptions(userId, options) {
  const connection = await updateZendeskOptions(userId, options)
  cache.delete(userId)

  return connection
}

export async function setZendeskWrites(userId, enabled) {
  return updateOptions(userId, { writesEnabled: enabled })
}

export async function setZendeskView(userId, input) {
  return updateOptions(userId, { viewId: parseZendeskViewId(input) })
}

export async function isZendeskConfigured(userId) {
  return Boolean(await getZendeskConnection(userId))
}

export function _resetZendeskSettingsCacheForTests() {
  cache.clear()
}
