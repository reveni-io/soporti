import { getConfigValue, setConfigValue } from '../db/app-config.js'
import { isGithubLogin } from './sanitize.js'

export const GITHUB_TOKEN_KEY = 'github_token'
export const GITHUB_WEBHOOK_SECRET_KEY = 'github_webhook_secret'
export const REPO_CATALOG_KEY = 'repo_catalog'
export const REVIEWER_SUGGESTIONS_KEY = 'github_reviewer_suggestions'

const CACHE_TTL_MS = 60_000
const MAX_NEWCOMERS = 50
const SHOWN_LOGIN_LENGTH = 40
const cache = new Map()

async function getCachedValue(key) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }
  const value = await getConfigValue(key)
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export async function getGithubToken() {
  const stored = await getCachedValue(GITHUB_TOKEN_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function setGithubToken(token) {
  await setConfigValue(GITHUB_TOKEN_KEY, token)
  cache.delete(GITHUB_TOKEN_KEY)
}

export async function getWebhookSecret() {
  const stored = await getCachedValue(GITHUB_WEBHOOK_SECRET_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function setWebhookSecret(secret) {
  await setConfigValue(GITHUB_WEBHOOK_SECRET_KEY, secret)
  cache.delete(GITHUB_WEBHOOK_SECRET_KEY)
}

export async function getRepoCatalog() {
  const stored = await getCachedValue(REPO_CATALOG_KEY)
  return typeof stored === 'string' ? stored : ''
}

export async function setRepoCatalog(catalog) {
  await setConfigValue(REPO_CATALOG_KEY, catalog)
  cache.delete(REPO_CATALOG_KEY)
}

export function parseReviewerSuggestions({ enabled, newcomers } = {}) {
  if (typeof enabled !== 'boolean') return { error: '"enabled" must be true or false.' }
  if (!Array.isArray(newcomers) || newcomers.some(login => typeof login !== 'string')) {
    return { error: '"newcomers" must be a list of GitHub usernames.' }
  }

  const logins = uniqueLogins(newcomers.map(login => login.trim().replace(/^@/, '')).filter(Boolean))
  if (logins.length > MAX_NEWCOMERS) return { error: `List at most ${MAX_NEWCOMERS} people new to the code.` }

  const invalid = logins.find(login => !isGithubLogin(login))
  if (invalid) return { error: `"${invalid.slice(0, SHOWN_LOGIN_LENGTH)}" is not a GitHub username.` }

  return { value: { enabled, newcomers: logins } }
}

function uniqueLogins(logins) {
  const seen = new Set()

  return logins.filter(login => {
    const key = login.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function getReviewerSuggestions() {
  const stored = await getCachedValue(REVIEWER_SUGGESTIONS_KEY)
  return {
    enabled: stored?.enabled === true,
    newcomers: Array.isArray(stored?.newcomers) ? stored.newcomers : [],
  }
}

export async function setReviewerSuggestions(settings) {
  await setConfigValue(REVIEWER_SUGGESTIONS_KEY, settings)
  cache.delete(REVIEWER_SUGGESTIONS_KEY)
  return settings
}

export function _resetSettingsCacheForTests() {
  cache.clear()
}
