import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const SLACK_BOT_TOKEN_KEY = 'slack_bot_token'
export const SLACK_APP_TOKEN_KEY = 'slack_app_token'
export const SLACK_SIGNING_SECRET_KEY = 'slack_signing_secret'

const CACHE_TTL_MS = 60_000
const cache = new Map()

async function getCachedValue(key) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value
  }
  const stored = await getConfigValue(key)
  const value = typeof stored === 'string' && stored.length > 0 ? stored : null
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

async function setValue(key, value) {
  await setConfigValue(key, value)
  cache.delete(key)
}

export async function getSlackBotToken() {
  return getCachedValue(SLACK_BOT_TOKEN_KEY)
}

export async function setSlackBotToken(token) {
  await setValue(SLACK_BOT_TOKEN_KEY, token)
}

export async function getSlackAppToken() {
  return getCachedValue(SLACK_APP_TOKEN_KEY)
}

export async function setSlackAppToken(token) {
  await setValue(SLACK_APP_TOKEN_KEY, token)
}

export async function getSlackSigningSecret() {
  return getCachedValue(SLACK_SIGNING_SECRET_KEY)
}

export async function setSlackSigningSecret(secret) {
  await setValue(SLACK_SIGNING_SECRET_KEY, secret)
}

export async function getSlackSettings() {
  const [botToken, appToken, signingSecret] = await Promise.all([
    getSlackBotToken(),
    getSlackAppToken(),
    getSlackSigningSecret(),
  ])
  return { botToken, appToken, signingSecret }
}

export async function isSlackConfigured() {
  const { botToken, appToken } = await getSlackSettings()
  return Boolean(botToken && appToken)
}

export function _resetSlackSettingsCacheForTests() {
  cache.clear()
}
