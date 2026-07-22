import { getConfigValue, setConfigValue } from '../db/app-config.js'

// Slack bot credentials, stored in the database (app_config) and edited from
// the admin panel (Slack section) — no env vars. The database is the single
// source of truth. Values are cached briefly because they are read whenever the
// bot (re)connects and when downloading ticket attachments; saves invalidate
// the cache immediately in this process, the TTL covers other instances.
//
// The three values are secrets, so they are write-only from the admin's point
// of view (only whether each is configured is ever returned).

export const SLACK_BOT_TOKEN_KEY = 'slack_bot_token'
export const SLACK_APP_TOKEN_KEY = 'slack_app_token'
export const SLACK_SIGNING_SECRET_KEY = 'slack_signing_secret'

const CACHE_TTL_MS = 60_000
const cache = new Map() // key -> { value, expiresAt }

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

// An empty string clears the value (that credential is removed). Each setter
// invalidates only its own cache entry.
async function setValue(key, value) {
  await setConfigValue(key, value)
  cache.delete(key)
}

// Bot (xoxb-) token used for all Web API calls and attachment downloads.
export async function getSlackBotToken() {
  return getCachedValue(SLACK_BOT_TOKEN_KEY)
}

export async function setSlackBotToken(token) {
  await setValue(SLACK_BOT_TOKEN_KEY, token)
}

// App-level (xapp-) token used to open the Socket Mode connection.
export async function getSlackAppToken() {
  return getCachedValue(SLACK_APP_TOKEN_KEY)
}

export async function setSlackAppToken(token) {
  await setValue(SLACK_APP_TOKEN_KEY, token)
}

// Signing secret. Optional in Socket Mode (Bolt does not need it to open the
// socket), kept configurable for completeness / future HTTP mode.
export async function getSlackSigningSecret() {
  return getCachedValue(SLACK_SIGNING_SECRET_KEY)
}

export async function setSlackSigningSecret(secret) {
  await setValue(SLACK_SIGNING_SECRET_KEY, secret)
}

// Resolves the three credentials in one shot (used when (re)starting the bot).
export async function getSlackSettings() {
  const [botToken, appToken, signingSecret] = await Promise.all([
    getSlackBotToken(),
    getSlackAppToken(),
    getSlackSigningSecret(),
  ])
  return { botToken, appToken, signingSecret }
}

// True when the bot can connect: both the bot token and the app token are set.
// The signing secret is optional in Socket Mode. Async because the credentials
// live in the database now (they used to be synchronous env-derived values).
export async function isSlackConfigured() {
  const { botToken, appToken } = await getSlackSettings()
  return Boolean(botToken && appToken)
}

// Test-only: clear the cache between tests.
export function _resetSlackSettingsCacheForTests() {
  cache.clear()
}
